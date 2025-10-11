#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
import { v4 as uuidv4 } from 'uuid';
const pool = new Pool();

/* ======  主函数  ====== */
(async () => {
    const client = await pool.connect();
    try {
        const dir = process.argv[2] || './articles';
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
        if (!files.length) {
            console.log('目录内无 JSON 文件');
            return;
        }

        await client.query('BEGIN');

        for (const file of files) {
            console.log(`正在处理文件: ${file}`);
            const filePath = path.join(dir, file);
            const json = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            await importOneArticle(client, json);
        }

        await client.query('COMMIT');
        console.log('✅ 全部导入完成');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ 导入失败:', e);
    } finally {
        client.release();
        await pool.end();
    }
})();

/* ======  单篇文章处理  ====== */
async function importOneArticle(client, art) {
    console.log(`处理文章: ${art.title}`);

    // 1. 处理分类
    let categoryId = null;
    if (art.categories) {
        // 先尝试查找已存在的分类
        const categoryRes = await client.query(
            'SELECT id FROM categories WHERE name = $1 OR slug = $2',
            [art.categories, slugify(art.categories)]
        );

        if (categoryRes.rows.length > 0) {
            categoryId = categoryRes.rows[0].id;
            console.log(`使用现有分类: ${art.categories} (id=${categoryId})`);
        } else {
            // 创建新分类
            const slug = slugify(art.categories);
            const insertRes = await client.query(
                `INSERT INTO categories (name, slug, created_at, updated_at) 
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [art.categories, slug, new Date(), new Date()]
            );
            categoryId = insertRes.rows[0].id;
            console.log(`创建新分类: ${art.categories} (id=${categoryId})`);
        }
    }

    // 2. 检查文章是否已存在（通过 uuid）
    const existingPost = await client.query(
        'SELECT id FROM posts WHERE uuid = $1',
        [art.article_id]
    );

    let postId;
    if (existingPost.rows.length > 0) {
        // 更新现有文章
        postId = existingPost.rows[0].id;
        await client.query(
            `UPDATE posts SET 
                author_id = $1, category_id = $2, title = $3, summary = $4, 
                content = $5, status = $6, published_at = $7, updated_at = $8
             WHERE id = $9`,
            [
                1, // 默认作者
                categoryId,
                art.title,
                art.description,
                art.content,
                art.status === 1 ? 1 : 0,
                art.created_at,
                new Date(),
                postId
            ]
        );
        console.log(`更新文章: ${art.title} (id=${postId})`);
    } else {
        // 插入新文章 - 使用 article_id 作为 UUID
        const postRes = await client.query(
            `INSERT INTO posts(uuid, author_id, category_id, title, summary, content,markdowncontent, status, published_at, created_at, updated_at,view_count)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,$11,$12)
             RETURNING id`,
            [
                uuidv4(), // 使用 article_id 作为 UUID
                1, // 默认作者
                categoryId,
                art.title,
                art.description,
                art.content,
                art.markdowncontent,
                art.status === 1 ? 1 : 0,
                art.created_at,
                art.created_at,
                art.created_at,
                art.viewCount
            ]
        );
        postId = postRes.rows[0].id;
        console.log(`创建新文章: ${art.title} (id=${postId}, uuid=${art.article_id})`);
    }

    // 3. 处理标签 - 使用不区分大小写的匹配并处理重复
    if (art.tags) {
        // 先删除现有的标签关联
        await client.query('DELETE FROM post_tags WHERE post_id = $1', [postId]);

        const tagNames = Array.isArray(art.tags) ? art.tags : art.tags.split(',').map(t => t.trim());

        for (const name of tagNames) {
            if (!name) continue;

            // 查找标签（不区分大小写），选择最新的一个
            let tagId;
            const tagRes = await client.query(
                'SELECT id FROM tags WHERE LOWER(name) = LOWER($1) ORDER BY id DESC LIMIT 1',
                [name]
            );

            if (tagRes.rows.length > 0) {
                // 使用找到的标签（取最新的一个）
                tagId = tagRes.rows[0].id;
                console.log(`使用现有标签: ${name} (id=${tagId})`);
            } else {
                // 创建新标签
                try {
                    const insertTagRes = await client.query(
                        'INSERT INTO tags (name, created_at, updated_at) VALUES ($1, $2, $3) RETURNING id',
                        [name, new Date(), new Date()]
                    );
                    tagId = insertTagRes.rows[0].id;
                    console.log(`创建新标签: ${name} (id=${tagId})`);
                } catch (error) {
                    if (error.code === '23505') { // 唯一约束冲突
                        console.log(`标签 ${name} 已存在，重新查询...`);
                        // 重新查询获取已存在的标签ID
                        const retryRes = await client.query(
                            'SELECT id FROM tags WHERE LOWER(name) = LOWER($1) ORDER BY id DESC LIMIT 1',
                            [name]
                        );
                        if (retryRes.rows.length > 0) {
                            tagId = retryRes.rows[0].id;
                            console.log(`使用现有标签: ${name} (id=${tagId})`);
                        } else {
                            throw error;
                        }
                    } else {
                        throw error;
                    }
                }
            }

            // 关联文章和标签
            await client.query(
                'INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [postId, tagId]
            );
        }
        console.log(`关联标签: ${tagNames.join(', ')}`);
    }

    console.log(`✅ 完成: ${art.title}\n`);
}

/* ======  slug 处理  ====== */
function slugify(str) {
    return str.toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 100);
}
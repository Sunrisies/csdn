/* eslint-disable no-console */
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
import md5 from 'md5';
import * as qiniu from 'qiniu';
import chalk from 'chalk';

/* ===== 七牛配置 ===== */
const { ak, sk, bucket } = {

};
const mac = new qiniu.auth.digest.Mac(ak, sk);
const config = new qiniu.conf.Config();
config.zone = qiniu.zone.Zone_z2;
// config.useCdnDomain = true;

/* ===== 类型 ===== */
interface ArticleJSON {
    content: string;
    markdowncontent: string;
    [k: string]: any;
}

/* ===== 提取图片链接 ===== */
function extractImages(str: string): string[] {
    const reg = /https:\/\/i-blog\.csdnimg\.cn\/[^\s"')]+\.(?:jpe?g|png|webp|gif)/gi;
    return str.match(reg) ?? [];
}

/* ===== 下载文件 ===== */
const tmpDir = path.join(__dirname, 'tmp1');
fs.mkdirSync(tmpDir, { recursive: true });
function extractFileName(rawUrl: string): string {
    // 1. 去掉查询串和 hash
    const [clean] = rawUrl.split(/[?#]/);
    // 2. 取路径最后一截
    const base = path.basename(clean);
    // 3. URL 解码（中文、空格等）
    const decoded = decodeURIComponent(base);
    // 4. 过滤非法字符；保留中文、字母、数字、_ - .
    return decoded.replace(/[^一-龥\w.-]/g, '_');
}
async function download(url: string): Promise<string> {
    // const ext = path.extname(url).split('?')[0];
    const ext = extractFileName(url)
    const local = path.join(tmpDir, ext);
    // url的最后一个斜杠到结尾作为文件名
    // const url2 = url.replace(/.*\//, '').replace(/\?.*$/, '').replace(/#.*$/, '')
    // const url2 = url.replace(/\?.*$/, '')
    if (fs.existsSync(local)) return local; // 已存在跳过
    // console.log(local, '====')
    // png#2121,去掉#2121, png?112 去掉?112 png&112 去掉&112
    console.log('----', local, '-----', url)
    const writer = fs.createWriteStream(local);
    const res = await axios({ url, responseType: 'stream' });
    res.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(local));
        writer.on('error', reject);
    });
}

/* ===== 上传七牛 ===== */
// async function doUpload(key: string, filePath: string,): Promise<any> {
//     const formUploader = new qiniu.form_up.FormUploader(config);
//     const putExtra = new qiniu.form_up.PutExtra();
//     const options = { scope: `${bucket}:${key}`, insertOnly: 0, };
//     const putPolicy = new qiniu.rs.PutPolicy(options);
//     const uploadToken = putPolicy.uploadToken(mac);
//     console.log(chalk.blue(`上传凭证：${uploadToken}`))
//     console.log(chalk.blue(`文件名：${key}`))

//     console.log(chalk.blue(`文件路径：${key}`))
//     console.log(chalk.blue(`上传空间：${options.scope}`))
//     return new Promise((resolve, reject) => {
//         formUploader.putFile(uploadToken, key, filePath, putExtra, (err, body, info) => {
//             console.log(body, 'body');
//             console.log(err, 'err');
//             console.log(info, 'info');
//             if (!err && info.statusCode === 200) resolve(body);
//             else reject(err || body);
//         });
//     });
// }
const doUpload = (key, file) => {
    console.log(chalk.blue(`正在上传：${file}`));
    const options = {
        scope: `${bucket}:${key}`,
    };
    const formUploader = new qiniu.form_up.FormUploader(config);
    const putExtra = new qiniu.form_up.PutExtra();
    const putPolicy = new qiniu.rs.PutPolicy(options);
    const uploadToken = putPolicy.uploadToken(mac);
    return new Promise((resolve, reject) => {
        formUploader.putFile(uploadToken, key, file, putExtra, (err, body, info) => {
            if (err) {
                reject(err);
            }
            // console.log(body, 'body');
            if (info.statusCode === 200) {
                resolve(body);
            } else {
                reject(body);
            }
        });
    });
};
/* ===== 主流程 ===== */
export async function uploadImages(urls: string[]) {
    try {
        // 1. 读原始 JSON
        // const rawJson = fs.readFileSync(path.join(__dirname, 'article.json'), 'utf-8');
        // const article: ArticleJSON = JSON.parse(rawJson);
        // const content = article.content + article.markdowncontent;

        // 2. 提取链接
        // const urls = [...new Set(extractImages(content))];
        console.log(chalk.blue(`共发现 ${urls.length} 张图片`));

        // 3. 下载 + 上传
        const mapping: Record<string, string> = {};
        for (const url of urls) {
            const local = await download(url);
            // 读取
            // const files = await fs.readdirSync('./tmp')
            // console.log(files, 'files');
            const key = path.basename(local);
            console.log(key, '图片上传');
            await doUpload(key, local);
            const cdnUrl = `http://t3wothpyb.hn-bkt.clouddn.com/${key}`; // 换成你的域名
            mapping[url] = cdnUrl;
            console.log(chalk.green(`✓ 上传完成：${url} -> ${cdnUrl}`));
        }

        // 4. 写出映射
        fs.writeFileSync(path.join(__dirname, 'imagesMap.json'), JSON.stringify(mapping, null, 2));
        console.log(chalk.green('映射文件已生成：imagesMap.json'));
    } catch (e) {
        console.error(chalk.red(JSON.stringify(e)));
        process.exit(1);
    }
}

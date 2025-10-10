/* eslint-disable no-console */
// const path = require('path');
// const fs = require('fs');
// const qiniu = require('qiniu');

// const chalk = require('chalk');
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
import md5 from 'md5';
import * as qiniu from 'qiniu';
import chalk from 'chalk';
const { ak, sk, bucket } = {

};

const mac = new qiniu.auth.digest.Mac(ak, sk);

const config = new qiniu.conf.Config();
// 你创建空间时选择的存储区域
config.zone = qiniu.zone.Zone_z2;
config.useCdnDomain = true;

const bucketManager = new qiniu.rs.BucketManager(mac, config);

/**
 * 上传文件方法
 * @param key 文件名
 * @param file 文件路径
 * @returns {Promise<unknown>}
 */
const doUpload = (key, file) => {
    console.log(chalk.blue(`正在上传：${file}`));
    const options = {
        scope: `${bucket}:${key}`,
    };
    const formUploader = new qiniu.form_up.FormUploader(config);
    const putExtra = new qiniu.form_up.PutExtra();
    const putPolicy = new qiniu.rs.PutPolicy(options);
    const uploadToken = putPolicy.uploadToken(mac);
    console.log(chalk.blue(`上传凭证：${uploadToken}`))
    console.log(chalk.blue(`文件名：${key}`))

    console.log(chalk.blue(`文件路径：${file}`))
    console.log(chalk.blue(`上传空间：${bucket}`))
    console.log(putExtra, 'putExtra')
    return new Promise((resolve, reject) => {
        formUploader.putFile(uploadToken, key, file, putExtra, (err, body, info) => {
            if (err) {
                reject(err);
            }
            if (info.statusCode === 200) {
                resolve(body);
            } else {
                reject(body);
            }
        });
    });
};

const getBucketFileList = (callback, marker, list = []) => {
    !marker && console.log(chalk.blue('正在获取空间文件列表'));
    const options = {
        limit: 100,
    };
    if (marker) {
        options.marker = marker;
    }
    bucketManager.listPrefix(bucket, options, (err, respBody, respInfo) => {
        if (err) {
            console.log(chalk.red(`获取空间文件列表出错 ×`));
            console.log(chalk.red(`错误信息：${JSON.stringify(err)}`));
            throw err;
        }
        if (respInfo.statusCode === 200) {
            // 如果这个nextMarker不为空，那么还有未列举完毕的文件列表，下次调用listPrefix的时候，
            // 指定options里面的marker为这个值
            const nextMarker = respBody.marker;
            const { items } = respBody;
            const newList = [...list, ...items];
            if (!nextMarker) {
                console.log(chalk.green(`获取空间文件列表成功 ✓`));
                console.log(chalk.blue(`需要清理${newList.length}个文件`));
                callback(newList);
            } else {
                getBucketFileList(callback, nextMarker, newList);
            }
        } else {
            console.log(chalk.yellow(`获取空间文件列表异常 状态码${respInfo.statusCode}`));
            console.log(chalk.yellow(`异常信息：${JSON.stringify(respBody)}`));
        }
    });
};

const clearBucketFile = () =>
    new Promise((resolve, reject) => {
        getBucketFileList(items => {
            if (!items.length) {
                resolve();
                return;
            }
            console.log(chalk.blue('正在清理空间文件'));
            const deleteOperations = [];
            // 每个operations的数量不可以超过1000个，如果总数量超过1000，需要分批发送
            items.forEach(item => {
                deleteOperations.push(qiniu.rs.deleteOp(bucket, item.key));
            });
            bucketManager.batch(deleteOperations, (err, respBody, respInfo) => {
                if (err) {
                    console.log(chalk.red(`清理空间文件列表出错 ×`));
                    console.log(chalk.red(`错误信息：${JSON.stringify(err)}`));
                    reject();
                } else if (respInfo.statusCode >= 200 && respInfo.statusCode <= 299) {
                    console.log(chalk.green(`清理空间文件成功 ✓`));
                    resolve();
                } else {
                    console.log(chalk.yellow(`获取空间文件列表异常 状态码${respInfo.deleteusCode}`));
                    console.log(chalk.yellow(`异常信息：${JSON.stringify(respBody)}`));
                    reject();
                }
            });
        });
    });

const publicPath = path.join(__dirname, 'tmp1');

const uploadAll = async (dir, prefix) => {
    // if (!prefix) {
    //     console.log(chalk.blue('执行清理空间文件'));
    //     await clearBucketFile();
    //     console.log(chalk.blue('正在读取打包文件'));
    // }
    const files = fs.readdirSync(dir);
    // if (!prefix) {
    //     console.log(chalk.green('读取成功 ✓'));
    //     console.log(chalk.blue('准备上传文件'));
    // }
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const key = prefix ? `${prefix}/${file}` : file;
        if (fs.lstatSync(filePath).isDirectory()) {
            // uploadAll(filePath, key);
        } else {
            doUpload(key, filePath)
                .then(() => {
                    console.log(chalk.green(`文件${filePath}上传成功 ✓`));
                })
                .catch(err => {
                    console.log(chalk.red(`文件${filePath}上传失败 ×`));
                    console.log(chalk.red(`错误信息：${JSON.stringify(err)}`));
                    console.log(chalk.blue(`再次尝试上传文件${filePath}`));
                    doUpload(file, filePath)
                        .then(() => {
                            console.log(chalk.green(`文件${filePath}上传成功 ✓`));
                        })
                        .catch(err2 => {
                            console.log(chalk.red(`文件${filePath}再次上传失败 ×`));
                            console.log(chalk.red(`错误信息：${JSON.stringify(err2)}`));
                            throw new Error(`文件${filePath}上传失败，本次自动化构建将被强制终止`);
                        });
                });
        }
    });
};

uploadAll(publicPath).finally(() => {
    console.log(chalk.green(`上传操作执行完毕 ✓`));
    console.log(chalk.blue(`请等待确认所有文件上传成功`));
});
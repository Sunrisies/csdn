import { uploadImages } from "./qiniu-upload-images";

const fs1 = require('node:fs');
const axios = require('axios');
const path = require('node:path');
// function extractCSDNImages(text: string): string[] {
//     // const reg = /https:\/\/i-blog\.csdnimg\.cn\/[^"'\s]+\.(?:jpe?g|png|webp|gif)/gi;
//     // const reg = /https:\/\/i-blog\.csdnimg\.cn\/[^"'\s]+\.(?:jpe?g|png|webp|gif)(?=\s*[\)"'\]>\n]|$)/gi;
//     const reg = /https:\/\/i-blog\.csdnimg\.cn\/[^"'\s)]*\.(?:jpe?g|png|webp|gif)(?=\s*[\)"'\]>\n]|$)/gi;
//     return text.match(reg) ?? [];
// }
const tmpDir = path.join(__dirname, 'data');
fs1.mkdirSync(tmpDir, { recursive: true });
function extractAllImageUrls(content: string): string[] {
    // 综合正则，匹配多种图片格式
    const comprehensiveRegex = /(?:!\[.*?\]\((https?:\/\/[^\s)]+)\)|<img[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*>|src=["'](https?:\/\/[^"']+)["'])/gi;

    const imageUrls: string[] = [];
    let match;

    while ((match = comprehensiveRegex.exec(content)) !== null) {
        // match[1] 是Markdown格式，match[2] 是HTML img标签，match[3] 是其他src属性
        const url = match[1] || match[2] || match[3];
        if (url) {
            imageUrls.push(url);
        }
    }

    return [...new Set(imageUrls)]; // 去重
}
const readCsdnList = () => {
    let index = 0
    // 当前当前目录
    // fs1.readdir('./data1', (err, files) => {
    //     console.log(files.length, '当前目录下的文件数量')
    //     files.forEach((file, index) => {
    //         // if (index > 2) return;
    //         // fs1.readFile(`./data2/data1/${file}`, 'utf8', async (err, data) => {
    //         //     console.log(data, '开始处理');
    //         //     // const { markdowncontent } = JSON.parse(data);
    //         //     // const imgRegex = /!\[.*?\]\((.*?)\)/g;
    //         //     // const imgMatches = markdowncontent.match(imgRegex);
    //         //     // if (imgMatches) {
    //         //     //     // 提取图片链接
    //         //     //     const imgLinks = imgMatches.map(match => {
    //         //     //         const imgLink = match.match(/\((.*?)\)/);
    //         //     //         return imgLink && imgLink[1];
    //         //     //     }).filter(link => link);
    //         //     //     const ls = await readImage(imgLinks, data, file);
    //         //     //     const filePath = path.join(__dirname, `./data3/${file}`);
    //         //     //     fs1.writeFileSync(filePath, ls);
    //         //     // }
    //         // })
    //     })

    // })
    let images: string[] = [];
    let files = fs1.readdirSync('./list');
    // for (let file of files) {
    //     let s = '140834870.json'
    //     const data = fs1.readFileSync(`./list/${file}`, 'utf8')
    //     // console.log(data, '开始处理');
    //     images.push(...extractAllImageUrls(data))
    //     let ms = extractAllImageUrls(data)

    // }
    const imagesMap = JSON.parse(fs1.readFileSync('./imagesMap.json', 'utf8'));
    for (let file of files) {
        const data = fs1.readFileSync(`./list/${file}`, 'utf8')
        // 读取imagesMap.json文件
        // console.log(imagesMap, 'imagesMap');
        // for (let key in imagesMap) {
        //     console.log(imagesMap[key], 'key')
        //     let data1 = data.replaceAll(key, imagesMap[key])
        //     console.log(data1, '替换成功')
        //     // 写入到新的文件中
        //     fs1.writeFileSync(`./data/${file}`, data1);
        // }
        const replacedData = Object.entries(imagesMap).reduce((acc, [key, value]) => {
            return acc.replaceAll(key, value);
        }, data);
        fs1.writeFileSync(`./data/${file}`, replacedData);
    }
    // console.log(index, images.length, '总文件数量');
    // if (images.length > 0) {
    //     // console.log(images, '总图片数量');
    //     uploadImages(images);
    // }


}

const readImage = async (list: string[], data: any, file: string) => {
    return await new Promise(async (resolve, reject) => {

        for (let item of list) {
            const name = item.split('/').pop()!
            await downloadImage(item).then(async (data1) => {
                const as = await uploadImage(data1, name)
                data = data.replaceAll(item, as);
            })
        }
        resolve(data);
    })
}
async function downloadImage(url: string): Promise<Buffer> {
    const { data } = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(data);
}
const uploadImage = (buffer: Buffer, name: string) => {
    console.log(name, '图片上传');
    // return new Promise((resolve, reject) => {
    //     var axios = require('axios');
    //     var FormData = require('form-data');
    //     var fs = require('fs');
    //     var data = new FormData();
    //     data.append('file', buffer, name);

    //     var config = {
    //         method: 'post',
    //         url: 'https://api.chaoyang1024.top/api/storage',
    //         headers: {
    //             'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjYsInVzZXJuYW1lIjoi6JaE5by6Iiwicm9sZSI6InVzZXIiLCJwZXJtaXNzaW9ucyI6NTIzLCJpYXQiOjE3NTM5MjkxMTksImV4cCI6MTc1MzkzMjcxOX0.U_nRBDEI8K3Tyo1GpgicTcrdHg2P980dZJMKkIAlv9g',
    //             'User-Agent': 'Apifox/1.0.0 (https://apifox.com)',
    //             'Accept': '*/*',
    //             'Host': 'api.chaoyang1024.top',
    //             'Connection': 'keep-alive',
    //             'Content-Type': 'multipart/form-data; boundary=--------------------------262388561534834552175467',
    //             ...data.getHeaders()
    //         },
    //         data: data
    //     };

    //     axios(config)
    //         .then(function (response) {
    //             console.log(response.data.data.path, '图片上传成功');
    //             resolve(response.data.data.path);
    //         })
    //         .catch(function (error) {
    //             console.log(error);
    //         });
    // })
}
readCsdnList();
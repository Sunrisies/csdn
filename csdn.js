const axios = require('axios');
const CryptoJS = require('crypto-js');
const fs = require('node:fs');
const path = require('node:path');
// 过滤特定请求头部
const filterHeaders = (headers) => {
  const filteredHeaders = {};
  for (const key in headers) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.startsWith("x-ca-")) {
      filteredHeaders[lowerKey] = headers[key];
    }
  }
  return filteredHeaders;
};

// 生成 HMAC 签名
const generateSignature = ({ method, url, appSecret, accept, date, contentType, params, headers }) => {
  let signatureString = `${method}\n${accept}\n\n${contentType}\n${date}\n`;

  // 处理请求头部
  const filteredHeaders = filterHeaders(headers);
  const sortedHeaderKeys = Object.keys(filteredHeaders).sort();
  for (const key of sortedHeaderKeys) {
    signatureString += `${key}:${filteredHeaders[key]}\n`;
  }

  // 处理 URL 和参数
  const processedUrl = url.replace(/^(?=^.{3,255}$)(http(s)?:\/\/)?(www\.)?[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.csdn\.net)/, "");
  const urlParams = new URLSearchParams();
  const sortedParamKeys = Object.keys(params).sort();
  for (const key of sortedParamKeys) {
    // urlParams.append(key, params[key]);
    if (params[key] !== null && params[key] !== undefined && params[key] !== '') {
      urlParams.append(key, params[key]);
    }
  }
  // 构建查询字符串时去掉空值参数的等号
  const queryString = sortedParamKeys.reduce((acc, key) => {
    if (params[key] !== null && params[key] !== undefined && params[key] !== '') {
      if (acc) acc += '&';
      acc += `${key}=${params[key]}`;
    } else if (params[key] === '') {
      if (acc) acc += '&';
      acc += `${key}`;
    }
    return acc;
  }, '');
  signatureString += urlParams.toString() ? `${processedUrl}?${queryString}` : processedUrl;
  return CryptoJS.HmacSHA256(signatureString, appSecret).toString(CryptoJS.enc.Base64);
};


// 生成随机数
const generateNonce = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (16 * Math.random()) | 0;
    return (char === "x" ? random : (random & 3) | 8).toString(16);
  });
};

// 发起请求
async function fetchCSDNArticles() {
  const nonce = generateNonce();
  const apiConfig = {
    method: 'GET',
    url: 'https://bizapi.csdn.net/blog/phoenix/console/v1/article/list',
    appSecret: '9znpamsyl2c7cdrr9sas0le9vbc3r6ba',
    accept: 'application/json, text/plain, */*',
    date: '',
    contentType: '',
    params: {
      page: 1,
      pageSize: 100,
      status: "all_v2"
    },
    headers: {
      "Accept": "application/json, text/plain, */*",
      "Content-Type": "",
      "X-Ca-Key": "203803574",
      'X-Ca-Nonce': nonce
    }
  };

  const signature = generateSignature(apiConfig);

  const requestHeaders = {
    'cookie': ` UserName=weixin_63115449; UserToken=a30f92b3a8e6479aa46f76d385bab8bc; UserNick=%E6%9C%9D%E9%98%B3581;___`, // 需替换有效cookie
    'x-ca-key': apiConfig.headers['X-Ca-Key'],
    'x-ca-nonce': nonce,
    'x-ca-signature': signature,
    "x-ca-signature-headers": "x-ca-key,x-ca-nonce",
  };

  try {
    const response = await axios.get(apiConfig.url, {
      headers: requestHeaders,
      params: apiConfig.params
    });

    const articles = response.data.data.list.map(item => ({
      id: item.articleId,
      postTime: item.postTime,
      title: item.title
    }));

    return articles;
  } catch (error) {
    console.error('请求失败:', error.response?.data || error.message);
    return [];
  }
}



async function getArticleDetail(id) {
  console.log('获取文章详情:', id);
  const nonce = generateNonce();

  const apiConfig = {
    method: 'GET',
    url: '/blog-console-api/v3/editor/getArticle',
    appSecret: '9znpamsyl2c7cdrr9sas0le9vbc3r6ba',
    accept: 'application/json, text/plain, */*',
    date: '',
    contentType: '',
    params: {
      id: id,
      model_type: ""
    },
    headers: {
      "Accept": "application/json, text/plain, */*",
      "Content-Type": "",
      "X-Ca-Key": "203803574",
      'X-Ca-Nonce': nonce
    }
  };
  const signature = generateSignature(apiConfig);
  console.log(signature, apiConfig.headers['X-Ca-Key'], nonce, '=============');
  const requestHeaders = {
    'cookie': ` UserName=weixin_63115449; UserToken=a30f92b3a8e6479aa46f76d385bab8bc; UserNick=%E6%9C%9D%E9%98%B3581;___`, // 需替换有效cookie
    'x-ca-key': "203803574",
    'x-ca-nonce': nonce,
    'x-ca-signature': signature, // 需要获取实际签名密钥
    "x-ca-signature-headers": "x-ca-key,x-ca-nonce",
  };
  try {
    const response = await axios.get(
      `https://bizapi.csdn.net/blog-console-api/v3/editor/getArticle?id=${id}&model_type=`,
      {

        headers: requestHeaders
      }
    );
    return response.data.data;
  } catch (error) {
    console.error('请求失败:', error.response?.data || error.message);
  }
}

let index = 0
async function main() {
  async function migrateArticles() {
    // const connection = await pool.getConnection();
    // await connection.beginTransaction();

    try {
      // 使用示例
      const list = await fetchCSDNArticles()

      for (const { id, postTime } of list) {
        try {
          const data = await getArticleDetail(id);
          // 字段预处理
          const insertData = {
            article_id: data.article_id,
            title: data.title.substring(0, 255),
            description: data.description || '',
            content: data.content,
            markdowncontent: data.markdowncontent,
            tags: (data.tags || '').substring(0, 255),
            categories: data.categories || 'default',
            type: data.type || 'original',
            status: Number.isInteger(data.status) ? data.status : 1,
            created_at: postTime
          };

          // 字段验证
          if (!insertData.article_id) {
            throw new Error(`无效的article_id: ${insertData.article_id}`);
          }
          console.log("插入数据:", insertData);
          // 写入到一个json文件
          const jsonData = JSON.stringify(insertData, null, 2);
          const filePath = path.join(__dirname, `./list/${id}.json`);
          fs.writeFileSync(filePath, jsonData);

          // 执行插入
          // const [result] = await connection.query(
          //   'INSERT INTO articles SET ?',
          //   insertData
          // );
          index++
          // console.log(`插入成功 ID: ${result.insertId}`);
        } catch (err) {
          console.error(`处理文章 ${id} 失败:`, err);
          throw err; // 抛出错误终止循环
        }
      }

      // await connection.commit();

      console.log('所有文章迁移完成,共计:', index);
    } catch (err) {
      // await connection.rollback();
      console.error('迁移过程失败，已回滚:', err);
      throw err;
    } finally {
      // connection.release();
      // pool.end(); // 在所有操作完成后关闭连接池
    }
  }

  migrateArticles()
    .catch(err => {
      console.error('全局捕获错误:', err);
      process.exit(1);
    });
}


main().catch(console.error);
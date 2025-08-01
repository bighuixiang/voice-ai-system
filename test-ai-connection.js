// 测试API服务到AI服务的连接
const https = require('https');
const http = require('http');

console.log('🔍 测试API服务到AI服务的连接...');

// 测试1: 使用Node.js内置的http模块
function testWithHttp() {
    return new Promise((resolve, reject) => {
        console.log('\n📡 测试1: 使用Node.js http模块');
        
        const postData = JSON.stringify({
            content: "测试连接"
        });
        
        const options = {
            hostname: 'localhost',
            port: 8000,
            path: '/api/process/text',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const req = http.request(options, (res) => {
            console.log(`✅ HTTP状态码: ${res.statusCode}`);
            
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    console.log('✅ HTTP模块测试成功');
                    console.log('📋 响应数据:', JSON.stringify(result, null, 2));
                    resolve(result);
                } catch (error) {
                    console.log('❌ 解析响应失败:', error.message);
                    reject(error);
                }
            });
        });
        
        req.on('error', (error) => {
            console.log('❌ HTTP请求失败:', error.message);
            reject(error);
        });
        
        req.write(postData);
        req.end();
    });
}

// 测试2: 使用fetch (如果可用)
async function testWithFetch() {
    console.log('\n📡 测试2: 使用fetch API');
    
    try {
        // 检查fetch是否可用
        if (typeof fetch === 'undefined') {
            console.log('⚠️ fetch API不可用，尝试导入...');
            
            // 尝试使用node-fetch或其他fetch实现
            try {
                const { default: fetch } = await import('node-fetch');
                global.fetch = fetch;
                console.log('✅ 成功导入node-fetch');
            } catch (importError) {
                console.log('❌ 无法导入fetch实现:', importError.message);
                return;
            }
        }
        
        const response = await fetch('http://localhost:8000/api/process/text', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                content: "测试连接"
            })
        });
        
        console.log(`✅ Fetch状态码: ${response.status}`);
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Fetch测试成功');
            console.log('📋 响应数据:', JSON.stringify(result, null, 2));
            return result;
        } else {
            const errorText = await response.text();
            console.log('❌ Fetch请求失败:', errorText);
        }
    } catch (error) {
        console.log('❌ Fetch测试失败:', error.message);
        console.log('🔍 错误详情:', error);
    }
}

// 测试3: 检查网络连接
function testNetworkConnection() {
    return new Promise((resolve, reject) => {
        console.log('\n📡 测试3: 检查基础网络连接');
        
        const req = http.request({
            hostname: 'localhost',
            port: 8000,
            path: '/health',
            method: 'GET'
        }, (res) => {
            console.log(`✅ 健康检查状态码: ${res.statusCode}`);
            
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                console.log('✅ 网络连接正常');
                console.log('📋 健康检查响应:', data);
                resolve(data);
            });
        });
        
        req.on('error', (error) => {
            console.log('❌ 网络连接失败:', error.message);
            reject(error);
        });
        
        req.end();
    });
}

// 运行所有测试
async function runAllTests() {
    console.log('🚀 开始连接测试...\n');
    
    try {
        // 测试网络连接
        await testNetworkConnection();
        
        // 测试HTTP模块
        await testWithHttp();
        
        // 测试Fetch API
        await testWithFetch();
        
        console.log('\n🎉 所有测试完成！');
        
    } catch (error) {
        console.log('\n❌ 测试过程中出现错误:', error.message);
    }
}

// 运行测试
runAllTests();
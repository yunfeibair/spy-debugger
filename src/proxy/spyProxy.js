const url = require('url');
const mitmProxy = require('node-mitmproxy');
const httpUtil = require('../util/httpUtil');
const zlib = require('zlib');
const through = require('through2');
const config = require('../config/config');
const htmlUtil = require('../util/htmlUtil');

module.exports = {

    createProxy ({
        injectScriptTag,
        port = 9888
    }) {
        mitmProxy.createProxy({
            port,
            sslConnectInterceptor: (req, cltSocket, head) => {

                var srvUrl = url.parse(`https://${req.url}`);
                // 忽略微信的推广页
                if (srvUrl.host === 'mp.weixin.qq.com:443') {
                    return false;
                }
                // 只拦截浏览器的https请求
                if (req.headers && req.headers['user-agent'] && /^Mozilla/.test(req.headers['user-agent'])) {
                    return true
                } else {
                    return false
                }
            },
            requestInterceptor: (rOptions, req, res, ssl, next) => {
                if (rOptions.hostname === config.SPY_WEINRE_DOMAIN) {
                    rOptions.protocol = 'http:'
                    rOptions.hostname = '127.0.0.1'
                }
                next();
            },
            responseInterceptor: (req, res, proxyReq, proxyRes, ssl, next) => {
                var isHtml = httpUtil.isHtml(proxyRes);
                var contentLengthIsZero = (() => {
                    return proxyRes.headers['content-length'] == 0;
                })();
                if (!isHtml || contentLengthIsZero) {
                    next();
                } else {
                    Object.keys(proxyRes.headers).forEach(function(key) {
                        if(proxyRes.headers[key] != undefined){
                            var newkey = key.replace(/^[a-z]|-[a-z]/g, (match) => {
                                return match.toUpperCase()
                            });
                            var newkey = key;
                            if (isHtml && (key === 'content-length' || key === 'content-security-policy')) {
                                // do nothing
                            } else {
                                res.setHeader(newkey, proxyRes.headers[key]);
                            }
                        }
                    });

                    res.writeHead(proxyRes.statusCode);

                    var isGzip = httpUtil.isGzip(proxyRes);

                    if (isGzip) {
                        proxyRes.pipe(new zlib.Gunzip())
                        .pipe(through(function (chunk, enc, callback) {
                            chunkReplace(this, chunk, enc, callback, injectScriptTag);
                        })).pipe(new zlib.Gzip()).pipe(res);
                    } else {
                        proxyRes.pipe(through(function (chunk, enc, callback) {
                            chunkReplace(this, chunk, enc, callback, injectScriptTag);
                        })).pipe(res);
                    }
                }
                next();
            }
        });

    }
}
function chunkReplace (_this, chunk, enc, callback, injectScriptTag) {
    var chunkString = chunk.toString();
    var newChunkString = htmlUtil.injectScriptIntoHtml(chunkString, injectScriptTag);
    _this.push(new Buffer(newChunkString));
    callback();
}

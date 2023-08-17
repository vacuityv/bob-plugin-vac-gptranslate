/**
 * 由于各大服务商的语言代码都不大一样，
 * 所以我定义了一份 Bob 专用的语言代码，以便 Bob 主程序和插件之间互传语种。
 * Bob 语言代码列表 https://ripperhe.gitee.io/bob/#/plugin/addtion/language
 *
 * 转换的代码建议以下面的方式实现，
 * `xxx` 代表服务商特有的语言代码，请替换为真实的，
 * 具体支持的语种数量请根据实际情况而定。
 *
 * Bob 语言代码转服务商语言代码(以为 'zh-Hans' 为例): var lang = langMap.get('zh-Hans');
 * 服务商语言代码转 Bob 语言代码: var standardLang = langMapReverse.get('xxx');
 */
var util = require("$util");

var langMap = {
    'auto': '中文简体',
    'zh-Hans': '中文简体',
    'zh-Hant': '中文繁体',
    'yue': '粤语',
    'wyw': '文言文',
    'pysx': '拼音缩写',
    'en': '英语',
    'ja': '日语',
    'ko': '韩语',
    'fr': '法语',
    'de': '德语',
    'es': '西班牙语',
    'it': '意大利语',
    'ru': '俄语',
    'pt': '葡萄牙语',
    'nl': '荷兰语',
    'pl': '波兰语',
    'ar': '阿拉伯语'
};

var socket = '';
var readyState = false;
var connectIng = true;

function supportLanguages() {
    return ['auto', 'zh-Hans', 'zh-Hant', 'yue', 'wyw', 'pysx', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'it', 'ru', 'pt', 'nl', 'pl', 'ar'];
}

function translate(query, completion) {

    var streamSupFlag = false;
    var useStreamFlag = $option.useStreamFlag;
    try {
        var env = $env;
        if (typeof env !== "undefined") {
            appVersion = $env.appVersion;
            if (appVersion >= '1.8.0') {
                streamSupFlag = true;
            }
        }
    } catch (error) {
        $log.info('get env error, process as old version');
    }
    $log.info('streamSupFlag');
    $log.info(streamSupFlag);
    $log.info('useStreamFlag');
    $log.info(useStreamFlag);


    if (streamSupFlag && useStreamFlag === 'y') {
        // newTrans(query, completion);
        websocketTrans(query, completion);
    } else {
        oldTranslate(query, completion);
    }
}

function oldTranslate(query, completion) {

    $http.request({
        method: "POST",
        url: "https://chat.vacuity.me/vac-chat-api/chat/ext/loginTranslate",
        header: {
            "Content-Type": "application/json;charset=UTF-8"
        },
        body: initReqBody(query),
        handler: function (resp) {
            $log.info('请求结果');
            $log.info(util.desc(resp));
            var data = resp.data;
            $log.info(util.desc(data));
            $log.info(util.desc(data.code));
            if (data.code == '0') {
                translateResult = {
                    'toParagraphs': [data.data.content]
                }
                completion({'result': translateResult});
            } else {
                serviceError = {
                    'type': 'api',
                    'message': data.msg,
                    'addition': data.msg,
                }
                completion({'error': data.msg});
            }
        }
    });
}


function newTrans(query, completion) {

    resTxt = '';
    $http.streamRequest({
        method: "POST",
        url: "https://chat.vacuity.me/vac-chat-api/chat/ext/loginStreamTranslate",
        header: {
            "Content-Type": "application/json;charset=UTF-8"
        },
        body: initReqBody(query),
        streamHandler: function (resp) {
            var txt = resp.text;
            resTxt = resTxt + txt;
            translateResult = {
                'toParagraphs': [resTxt]
            }
            query.onStream({'result': translateResult});
        },
        handler: function (data, rawData, response, error) {
            query.onCompletion({
                result: {
                    toParagraphs: [resTxt],
                }
            });
        }
    });
}


var websocket = null;

var count = 0;
var timerId = 0;
var signal = $signal.new()

function initWebsocket() {
    if (websocket == null) {
        $log.info(`initWebsocket`)
        websocket = $websocket.new({
            url: "wss://chat.vacuity.me/vac-chat-api/stream/chat/chat",
            allowSelfSignedSSLCertificates: true,
            timeoutInterval: 100,
            header: {
                "Sec-WebSocket-Protocol": "someother protocols",
                "Sec-WebSocket-Version": "14",
            }
        })
        websocket.open();
        websocket.listenOpen(function (socket) {
            $log.info(`did open`);

            websocket.listenError(function (socket, error) {
                $log.info(`did error: code=${error.code}; message=${error.message}; type=${error.type}`);
            })
            websocket.listenReceiveData(function (socket, data) {
                $log.info(`did receive data: length=${data.length}`);
                count = 0;
                signal.send({"message": data})
            })
            socket.listenReceiveString(function (socket, string) {
                $log.info(`did receive string: ${string}`);
                count = 0;
                signal.send({"message": string})
            })
        })

        count = 0;

        if (timerId != 0) {
            $timer.invalidate(timerId);
        }

        timerId = $timer.schedule({
            interval: 10,
            repeats: true,
            handler: function () {
                count += 1;
                $log.info(`count=${count}`)
                // 空闲 10*60s 后关闭
                if (count > 60) {
                    $timer.invalidate(timerId);
                    if (websocket != null) {
                        websocket.close();
                    }
                }
            }
        });
    }
}

function sendSocketMsg(msg) {
    $log.info(`sendSocketMsg`)
    count = 0;
    if (websocket == null || websocket.readyState == 2 || websocket.readyState == 3) {
        websocket = null;
        initWebsocket();
    }
    if (websocket.readyState == 1) {
        $log.info('readyState == 1')
        websocket.sendString(msg);
    } else {
        var stateTimerId = $timer.schedule({
            interval: 1,
            repeats: true,
            handler: function () {
                $log.info(`checkready...state=${websocket.readyState}`)
                if (websocket.readyState == 1) {
                    $timer.invalidate(stateTimerId);
                    websocket.sendString(msg);
                }
            }
        });
    }
}

function websocketTrans(query, completion) {
    $log.info(`websocketTrans`)
    // 移除所有订阅制
    signal.removeAllSubscriber();
    resTxt = '';
    sendSocketMsg(JSON.stringify(initReqBody(query)));
    signal.subscribe(function (data) {
        msg = data.message
        if (msg == '###FINISH###') {
            query.onCompletion({
                result: {
                    toParagraphs: [resTxt],
                }
            });
            return;
        } else {
            resTxt = resTxt + msg
            translateResult = {
                'toParagraphs': [resTxt]
            }
            query.onStream({'result': translateResult});
        }
    })
}

function initReqBody(query) {
    var account = $option.loginAccount;
    var password = $option.loginPassword;
    var content = query['text'];

    return {
        email: account,
        password: password,
        content: content,
        targetLanguage: langMap[query['to']],
        translateFrom: 'bob'
    };
}


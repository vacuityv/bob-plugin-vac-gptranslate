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

// var usaHttp = "https://chat.aipolish.online/vac-chat-api/chat/ext/loginTranslate";
// var usaWss = "wss://chat.aipolish.online/vac-chat-api/stream/chat/chat";
// var usaHttp = "http://127.0.0.1:8081/vac-chat-api/chat/ext/loginTranslate";
// var usaWss = "ws://127.0.0.1:8081/vac-chat-api/stream/chat/chat";
let serverMap = {
    'china': {
        'http': 'https://chat.aipolish.online/vac-chat-api/chat/ext/loginTranslate',
        'wss': 'wss://chat.aipolish.online/vac-chat-api/stream/chat/chat'
    },
    'usa': {
        'http': 'https://chat.vacuity.me/vac-chat-api/chat/ext/loginTranslate',
        'wss': 'wss://chat.vacuity.me/vac-chat-api/stream/chat/chat'
    },
}

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
            if (compareVersions(appVersion, '1.8.0') >= 0) {
                streamSupFlag = true
            }
        } else {
            $log.info('get env error, process as old version');
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
        $log.info("vac-body-stream" + initReqBody(query));
        websocketTrans(query, completion);
    } else {
        oldTranslate(query, completion);
    }
}

function oldTranslate(query, completion) {
    var url = serverMap[$option.server].http;
    $log.info("vac-body" + initReqBody(query));
    $http.request({
        method: "POST",
        url: url,
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


var websocket = null;

var count = 0;
var timerId = 0;
var signal = $signal.new()

function initWebsocket(wssUrl, msg) {


    if (websocket == null) {
        $log.info(`initWebsocket` + wssUrl);
        websocket = $websocket.new({
            url: wssUrl,
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
            websocket.sendString(msg);

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
        websocket.listenClose(function (socket, code, reason) {
            $log.info(`did close: code=${code}; reason=${reason}`);
        })

        count = 0;
    }
}

function sendSocketMsg(wssUrl, msg) {
    $log.info(`sendSocketMsg`)
    count = 0;
    if (websocket == null || websocket.readyState == 2 || websocket.readyState == 3) {
        websocket = null;
        initWebsocket(wssUrl, msg);
    } else {
        if (websocket.readyState == 1) {
            $log.info('readyState == 1' + msg)
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
}

function websocketTrans(query, completion) {
    $log.info(`websocketTrans`)
    // 移除所有订阅制
    signal.removeAllSubscriber();
    resTxt = '';
    thoughtFlag = false;
    showThoughtFlag = false;
    firstAnswer = true;
    var modelType = $option.modelType;
    if (modelType == 'deepseek-reasoner' || modelType == 'claude-3.7-sonnet') {
        thoughtFlag = true;
        if ($option.showThoughtFlag == 'y') {
            showThoughtFlag = true;
            resTxt = '思考过程：\n';
        }
    }
    var wssUrl = serverMap[$option.server].wss;
    thoughtEnd = false;
    sendSocketMsg(wssUrl, JSON.stringify(initReqBody(query)));
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
            if (thoughtFlag){
                isThoughtTxt = msg.startsWith("thought:");
                if (isThoughtTxt) {
                    if (showThoughtFlag) {
                        var txt = msg.substring(8);
                        txt = txt.replace(/\n> /g, "\n");
                        resTxt = resTxt + txt;
                    }
                } else {
                    if (firstAnswer) {
                        if (showThoughtFlag) {
                            resTxt = resTxt + '\n\n最终翻译结果:\n\n'
                        }
                        resTxt = resTxt + msg;
                        firstAnswer = false;
                    } else {
                        resTxt = resTxt + msg;
                    }
                }
            } else {
                resTxt = resTxt + msg
            }
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
    var modelType = $option.modelType;
    var prompt = $option.prompt;
    var content = query['text'];
    return {
        email: account,
        password: password,
        content: content,
        modelType: modelType,
        targetLanguage: langMap[query['to']],
        translateFrom: 'bob',
        prompt: prompt
    };
}

function compareVersions(version1, version2) {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);

    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
        const v1Part = v1Parts[i] || 0;
        const v2Part = v2Parts[i] || 0;

        if (v1Part > v2Part) return 1;
        if (v1Part < v2Part) return -1;
    }

    return 0;
}


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

var serverMap = {
    'china': {
        'http': 'https://chat.aipolish.online/vac-chat-api/chat/ext/loginTranslate',
        'sseSend': 'https://chat.aipolish.online/vac-chat-api/stream/chat/sse/loginTranslate'
    },
    'usa': {
        'http': 'https://chat.vacuity.me/vac-chat-api/chat/ext/loginTranslate',
        'sseSend': 'https://chat.vacuity.me/vac-chat-api/stream/chat/sse/loginTranslate'
    },
}


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
        $log.info("vac-body-stream" + initReqBody(query));
        sseTrans(query, completion);
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


function sseTrans(query, completion) {
    $log.info(`sseTrans`)
    var resTxt = '';
    var thoughtFlag = false;
    var showThoughtFlag = false;
    var firstAnswer = true;
    var modelType = $option.modelType;
    if (modelType == 'deepseek-reasoner' || modelType == 'claude-3.7-sonnet' || modelType == 'claude-sonnet-4') {
        thoughtFlag = true;
        if ($option.showThoughtFlag == 'y') {
            showThoughtFlag = true;
            resTxt = '思考过程：\n';
        }
    }
    var sseUrl = serverMap[$option.server].sseSend;

    $http.streamRequest({
        method: "POST",
        url: sseUrl,
        header: {
            "Content-Type": "application/json;charset=UTF-8",
            "Accept": "text/event-stream"
        },
        body: initReqBody(query),
        streamHandler: function (stream) {
            var data = stream.text;
            $log.info('SSE received data:' + data);

            if (data.trim() === '') {
                return;
            }

            var lines = data.split('\n');
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                $log.info('SSE received line:' + line);
                if (line != '') {
                    msg = line;
                    if (line.startsWith('data:')) {
                        msg = line.substring(5);
                    }
                    if (msg === '[DONE]' || msg === '###FINISH###') {
                        query.onCompletion({
                            result: {
                                toParagraphs: [resTxt],
                            }
                        });
                        return;
                    }

                    if (msg === '') {
                        continue;
                    }

                    if (thoughtFlag) {
                        var isThoughtTxt = msg.startsWith("thought:");
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
                    $log.info('resTxt:' + resTxt);
                    var translateResult = {
                        'toParagraphs': [resTxt]
                    }
                    query.onStream({'result': translateResult});
                }
            }
        },
        handler: function (resp) {
            $log.info('SSE request completed');
            if (resp.error) {
                $log.info('SSE error: ' + resp.error);
                completion({'error': resp.error});
            }
        }
    });
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


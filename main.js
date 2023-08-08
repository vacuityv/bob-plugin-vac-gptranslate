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
        newTrans(query, completion);
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

function initReqBody(query) {
    var account = $option.loginAccount;
    var password = $option.loginPassword;
    var content = query['text'];

    return {
        email: account,
        password: password,
        content: content,
        targetLanguage: langMap[query['to']],
    };
}


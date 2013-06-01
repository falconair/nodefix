exports.getUTCTimeStamp = function (datetime) {
    var timestamp = datetime || new Date();

    var year = timestamp.getUTCFullYear();
    var month = timestamp.getUTCMonth() +1;
    var day = timestamp.getUTCDate();
    var hours = timestamp.getUTCHours();
    var minutes = timestamp.getUTCMinutes();
    var seconds = timestamp.getUTCSeconds();
    var millis = timestamp.getUTCMilliseconds();

    if (month < 10) { month = '0' + month;}
    if (day < 10) { day = '0' + day;}
    if (hours < 10) { hours = '0' + hours;}
    if (minutes < 10) { minutes = '0' + minutes;}
    if (seconds < 10) { seconds = '0' + seconds;}

    if (millis < 10) {
        millis = '00' + millis;
    } else if (millis < 100) {
        millis = '0' + millis;
    }

    return [year, month, day, '-' , hours, ':' , minutes, ':' , seconds, '.' , millis].join('');
};

exports.getCheckSum = function (str) {
    var checkSum = 0;
    var checkSumStr = "";

    for (var i = 0; i < str.length; i++) {
        checkSum += str.charCodeAt(i);
    }
    checkSum = (checkSum % 256) + "";
    if (checkSum.length === 1) {
        checkSumStr = "00" + checkSum;
    } else if (checkSum.length === 2) {
        checkSumStr = "0" + checkSum;
    } else {
        checkSumStr = checkSum;
    }
    return checkSumStr;
};
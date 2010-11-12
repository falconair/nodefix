//static vars
var SOHCHAR = String.fromCharCode(1);
var ENDOFTAG8 = 10;
var STARTOFTAG9VAL = ENDOFTAG8 + 2;
var SIZEOFTAG10 = 8;

exports.SOHCHAR = SOHCHAR;
exports.ENDOFTAG8 = ENDOFTAG8;
exports.STARTOFTAG9VAL = STARTOFTAG9VAL;
exports.SIZEOFTAG10 = SIZEOFTAG10;

exports.logger_format = function(level, timestamp, message) {
  return [timestamp.getUTCFullYear() ,"/", timestamp.getUTCMonth() ,"/", timestamp.getUTCDay() , "-" , timestamp.getUTCHours() , ":" , timestamp.getUTCMinutes() , ":" , timestamp.getUTCSeconds() , "." , timestamp.getUTCMilliseconds() , " [" , level, "] ",  message].join("");
};

//Utility methods
exports.tag2txt = function(msg){ return Object.keys(msg).map(function(key){return tags[key]+"="+msg[key];}).join("|");}

exports.checksum = function(str){
    var chksm = 0;
    for(var i=0; i<str.length; i++){
        chksm += str.charCodeAt(i);
    }
    
    chksm = chksm % 256;
    
    var checksumstr = "";
    if (chksm < 10) {
        checksumstr = "00" + (chksm+'');
    }
    else if (chksm >= 10 && chksm < 100) {
        checksumstr = "0" + (chksm+'');
    }
    else {
        checksumstr = "" + (chksm+'');
    }
    
    return checksumstr;
}


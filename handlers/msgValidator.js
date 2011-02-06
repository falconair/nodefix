exports.newMsgValidator = function() {
    return new msgValidator();
};

var path = require('path');
var fs = require('fs');
var sys = require('sys');

//static vars
var SOHCHAR = String.fromCharCode(1);

function msgValidator(){

    this.fileStream = null;
    var self = this;

    //||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||INCOMING
    this.incoming = function(ctx, event){
        if(event.type !== 'data'){
            ctx.sendNext(event);
            return;
        }
        var msg = event.data;
        //====================================Step 2: Validate message====================================

        var calculatedChecksum = checksum(msg.substr(0, msg.length - 7));
        var extractedChecksum = msg.substr(msg.length - 4, 3);

        if (calculatedChecksum !== extractedChecksum) {
            sys.log('[WARNING] Discarding message because body length or checksum are wrong (expected checksum: '
                + calculatedChecksum + ', received checksum: ' + extractedChecksum + '): [' + msg + ']');
            return;
        }

        ctx.sendNext(event);

    }
        
}


function checksum(str) {
    var chksm = 0;
    for (var i = 0; i < str.length; i++) {
        chksm += str.charCodeAt(i);
    }

    chksm = chksm % 256;

    var checksumstr = '';
    if (chksm < 10) {
        checksumstr = '00' + (chksm + '');
    }
    else if (chksm >= 10 && chksm < 100) {
        checksumstr = '0' + (chksm + '');
    }
    else {
        checksumstr = '' + (chksm + '');
    }

    return checksumstr;
}

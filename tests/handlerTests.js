//TODO Move heartbeat logic to its own handler
//TODO Move login logic to its own handler
//TODO Convert FIX's documented test cases to javascript test cases
var pipe = require("../lib/nodepipe");
var assert = require("assert");

var FIXFrameDecoder = require("../handlers/FIXFrameDecoderHandler");
var FIXParser = require("../handlers/FIXParserHandler");
var FIXMsgCreator = require("../handlers/FIXMsgCreatorHandler");

const FIX42 = {version: "FIX.4.2",
		headers:["8", "9", "35", "49", "56", "115?", "128?", "90?", "91?", "34", "50?","142?", "57?", "143?", "116?", "144?", "129?", "145?", "43?", "97?","52", "122?", "212?", "213?", "347?", "369?", "370?"],
		trailers:["39?","89?","10"]};

var tests = {
    TestFIXFrameDecoder: function(){

        var fix = "8=FIX.4.49=11735=AD34=249=A50=152=20100219-14:33:32.25856=B57=M263=1568=1569=0580=175=2010021860=20100218-00:00:00.00010=202";
        var result = 0;
        var testMsg = fix + "" + fix;
        
        var pipeline = pipe.makePipe({end:function(){}});
        
        pipeline.addHandler(FIXFrameDecoder.makeFIXFrameDecoder());
        pipeline.addHandler( {incoming: function(ctx,evt){ result++; } } );
        
        pipeline.pushIncomingData(testMsg);

        assert.equal(2, result);
    },

    TestFIXParser: function(){

        var fix = "8=FIX.4.29=6735=A52=20100826-02:58:56.29598=0108=3056=SENDER49=TARGET34=110=150";
        var result = 0;

        
        var pipeline = pipe.makePipe({ end:function(){} });
        
        pipeline.addHandler(FIXParser.makeFIXParser(FIX42));
        pipeline.addHandler( {incoming: function(ctx,evt){ if(evt.eventType==="data"){assert.equal( evt.data['8'] , "FIX.4.2" );} } } );
        
        pipeline.pushIncomingData(fix);

        //assert.equal(2, result);
    },

    TestMsgCreator: function(){
        var actual = "x";
        var expected = "8=FIX.4.29=5535=A52=20100826-02:58:56.29556=SENDER49=TARGET34=110=122";
        
        var msg = {8:"FIX.4.4", 35:"A"};
        
        var pipeline = pipe.makePipe({end:function() {}  , write:function(msg){console.log(msg);} });

        pipeline.state['senderCompID'] = "SENDER";
        pipeline.state['targetCompID'] = "TARGET";
        pipeline.state['outgoingSeqNum'] = 1;
        pipeline.state['incomingSeqNum'] = 1;
        
        pipeline.addHandler({ outgoing:function(ctx,event){ actual = event.data;} });
        pipeline.addHandler(FIXMsgCreator.makeFIXMsgCreator(FIX42));
        
        pipeline.pushOutgoingData(msg);
        
        //remove time stamp
        var expectedStartOfTS = parseInt(expected.indexOf("52="), 10);
        var expectedEndOfTS = parseInt(expected.indexOf("", expectedStartOfTS + 1), 10);
        var expectedTS = expected.substring(expectedStartOfTS, expectedEndOfTS);
        var normalizedExpected = expected.replace(expectedTS, "");
        //console.log(normalizedExpected);        

        var actualStartOfTS = parseInt(actual.indexOf("52="), 10);
        var actualEndOfTS = parseInt(actual.indexOf("", actualStartOfTS + 1), 10);
        var actualTS = actual.substring(actualStartOfTS, actualEndOfTS);
        var normalizedActual = actual.replace(actualTS, "");
        //console.log(normalizedActual);
        
        //remove checksum
        normalizedActual=normalizedActual.substring(0,normalizedActual.length-4);
        normalizedExpected=normalizedExpected.substring(0,normalizedExpected.length-4);
        
        assert.equal(normalizedActual, normalizedExpected);

    }
};


for (var testx in Object.keys(tests)) {
    if(true){
        console.log("\n\n============Running " + Object.keys(tests)[testx]);
        tests[Object.keys(tests)[testx]].call();
    }
}


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

        var fix = "8=FIX.4.49=11635=A34=249=A50=152=20100219-14:33:32.25856=B57=M263=1568=1569=0580=175=2010021860=20100218-00:00:00.00010=133";
        var result = 0;

        
        var pipeline = pipe.makePipe({ end:function(){} });
        
        pipeline.addHandler(FIXParser.makeFIXParser(FIX42));
        pipeline.addHandler( {incoming: function(ctx,evt){ assert.equal( evt.data['8'] = "FIX.4.4" ); } } );
        
        pipeline.pushIncomingData(fix);

        //assert.equal(2, result);
    },

    TestMsgCreator: function(){
        var msg = {8:"FIX.4.4", 35:"A"};
        
        var pipeline = pipe.makePipe({end:function() {}  , write:function(msg){console.log(msg);} });

        pipeline.state['senderCompID'] = "SENDER";
        pipeline.state['targetCompID'] = "TARGET";
        pipeline.state['outgoingSeqNum'] = 1;
        pipeline.state['incomingSeqNum'] = 1;
        
        pipeline.addHandler(FIXMsgCreator.makeFIXMsgCreator(FIX42));
        
        pipeline.pushOutgoingData(msg);
    }
};

//TestFIXFrameDecoder();
//TestFIXParser();
//TestMsgCreator();

for (var testx in Object.keys(tests)) {
    console.log("\n\n============Running " + Object.keys(tests)[testx]);
    tests[Object.keys(tests)[testx]].call();
}


/*

Copyright (c) 2010 Shahbaz Chaudhary

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.


*/

var net = require("net");
var events = require("events");
var sys = require("sys");
var logger = require("./lib/logger").createLogger();
var pipe = require("./lib/nodepipe");
var tags = require('./resources/fixtagnums').keyvals;




net.createServer(function(stream){
    var pipeline = pipe.makePipe(stream);

    //pipeline.addHandler(new FIXMsgWriter());
    pipeline.addHandler({outgoing: function(ctx,event){if(event.eventType==="data"){ctx.stream.write(event.data);}} });
    pipeline.addHandler(new FIXMsgEncoder());
    pipeline.addHandler(new FIXFrameDecoder());
    pipeline.addHandler(new FIXMsgDecoder());
    pipeline.addHandler(new FIXMsgValidator());
    
    stream.setEncoding("utf8");
    
    stream.on("data", function(data){pipeline.pushIncoming({eventType:"data", data:data});}); 
    stream.on("end", function(){pipeline.pushIncoming({eventType:"end"});}); 
});



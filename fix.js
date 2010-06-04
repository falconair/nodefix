var sys = require('sys');
var tcp = require('net');

var SOHCHAR = String.fromCharCode(1);
var ENDOFTAG8=10;
var STARTOFTAG9VAL=ENDOFTAG8+2;
var SIZEOFTAG10=8;

var server = tcp.createServer(function (socket) {

	socket.setEncoding("utf8");
	var databuffer = "";
	var charlen = 0;

	socket.addListener("connect", function () {
		socket.write("New connection from "+ socket.remoteAddress +"\r\n");
	});

	socket.addListener("data", function (data) {

		//Add data to the buffer (to avoid processing fragmented TCP packets)		
		databuffer += data;
		
		while(true){

			//Step 1: Extract complete FIX message

			//If we don't have enough data to start extracting body length, wait for more data
			if(databuffer.length <= ENDOFTAG8){ return; }

			var _idxOfEndOfTag9Str = databuffer.substring(ENDOFTAG8).indexOf(SOHCHAR);
			var idxOfEndOfTag9 = parseInt(_idxOfEndOfTag9Str) + ENDOFTAG8;

	
			//If we don't have enough data to stop extracting body length, wait for more data	
			if(idxOfEndOfTag9 < 0){ return; }

			var _bodyLengthStr = databuffer.substring(STARTOFTAG9VAL,idxOfEndOfTag9);
			var bodyLength = parseInt(_bodyLengthStr);
			var msgLength = bodyLength + idxOfEndOfTag9 + SIZEOFTAG10;

			//If we don't have enough data for the whole message, wait for more data
			if(databuffer.length < msgLength){ return; }

			var msg = databuffer.substring(0, msgLength);
			databuffer = databuffer.substring(msgLength);
			sys.log("FIX in: "+msg);

			//Step 2: Validate message
			if(msg.substr(-1 * (SIZEOFTAG10-1),3)!="10="){
				sys.log("[WARNING] Discarding message because according to body length, checksum is not at expected location: "+msg);
				continue;
			}
			
			//Step 3: Convert to map
			var keyvals = msg.split(SOHCHAR);
			//sys.debug("keyvals:"+keyvals);
			var fix = {};
			for(kv in keyvals){
				//sys.debug("kv:"+kv);
				var kvpair = keyvals[kv].split("=");
				fix[kvpair[0]] = kvpair[1];
			}
			
			var dbg = "";
			for( var x in fix){ dbg += ","+x;}
			sys.debug(dbg);
		}
		

	});

	socket.addListener("end", function () {
		//socket.write("Connection ended for "+ socket.remoteAddress +"\r\n");
		socket.end();
	});
});

server.listen(7000, "localhost");

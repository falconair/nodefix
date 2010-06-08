var sys = requier('sys');
var events = require('events');

function Server(name){
	events.EventEmitter.call(this);
	this.clients = new Array();
	this.name = name;
	this.addListener('newClient', function(client){ this.clients.push(client);});
}

function ClientConnection(steram, server){
	stream.setEncoding("utf8");

	stream.addListener('connect', function(){
		server.emit('newClient', socket);
	});

	stream.addListener('data', function(data){});

	this.stream = stream;
	this.server = server;
}

sys.inherits(Server, events.EventEmitter);
sys.inherits(ClientConnection, events.EventEmitter);

exports.createServer = function(name){
	var server = new Server(name);
	server.socket = tcp.createServer(function(stream){
		var client = new ClientConnection(stream, server);
		server.emit('newClient', client);
	});
	return server;
}

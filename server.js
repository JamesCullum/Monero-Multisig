var fs = require("fs"), crypto = require("crypto"), child = require('child_process');
var io = require('socket.io')(8000);

var inc = require("./static/js/inc"), words = inc.words, CRC32 = inc.crc32(), cnUtil = inc.cnUtil;
var Validator = require('jsonschema').Validator, jsonCheck = new Validator(), jsonSchema = require("./schema.json");

var socketIdentity = [], fusionRequestor = [], antiSpam = [];
// https://www.iconfinder.com/iconsets/circle-icons-1
var icons = { warning:"images/caution-48.png", bookmark:"images/booklet-48.png", gear:"images/gear-48.png", user:"images/profle-48.png", tick:"images/check-48.png", userRun:"images/running-48.png", screwdriver:"images/tools-48.png", recycle:"images/recycle-48.png", fire:"images/flame-48.png", hourglass:"images/hourglass-48.png"};

var maxUsers = 3, generateWalletsMax = 10000;
setInterval(function() {
	for(var id in antiSpam) {
		if(antiSpam[id]>0) antiSpam[id]--;
	}
}, 5000);

io.on('connection', function(socket) {
	var currentChannel = false;
	var profile = generateProfile();
	socketIdentity[socket.id] = profile;
	antiSpam[socket.id] = 0;
	socket.emit('set-profile', profile);
	
	socket.on('lobby-join', function(data) {
		if(currentChannel) return;
		if(spamFilter(socket.id)) return spamBlock(socket);
		var room = cleanValue(data, 50);
		var numUsers = io.nsps['/'].adapter.rooms[room] ? io.nsps['/'].adapter.rooms[room].length : 0;
		if(numUsers >= maxUsers) return socket.emit('chat-event', msg(icons.warning, "Lobby is full (maximum of "+maxUsers+")", 1));
		if(currentChannel) socket.leave(currentChannel);
		socket.join(room);
		currentChannel = room;
		
		var attendees = [];
		for (var socketId in io.nsps['/'].adapter.rooms[room].sockets) {
			attendees.push(socketIdentity[socketId].name);
		}
		attendees.splice(attendees.indexOf(socket.id),1);
		
		socket.emit("lobby-change", room);
		socket.emit('chat-event', msg(icons.bookmark, attendees.length ? attendees.length+' Attendee(s): '+attendees.join(", ") : "You are the first attendee", 1));
		io.to(room).emit("chat-event", msg(icons.user, profile.name+" has joined the lobby", 0));
	});
	
	socket.on('lobby-leave', function() {
		if(!currentChannel) return;
		if(spamFilter(socket.id)) return spamBlock(socket);
		clearFusion(socket.id, currentChannel);
		
		io.to(currentChannel).emit("chat-event", msg(icons.userRun, profile.name+" left the lobby", 0));
		socket.leave(currentChannel);
		currentChannel = false;
		socket.emit("lobby-change", false);
	});
	
	socket.on('disconnect', function() {
		if(currentChannel) io.to(currentChannel).emit("chat-event", msg(icons.userRun, profile.name+" disconnected", 0));
		clearFusion(socket.id);
		
		antiSpam.splice(antiSpam.indexOf(socket.id), 1);
		socketIdentity.splice(socketIdentity.indexOf(socket.id), 1);
	});
	
	socket.on('lobby-clearFusion', function() {
		if(spamFilter(socket.id)) return spamBlock(socket);
		if(clearFusion(socket.id, currentChannel)) io.to(currentChannel).emit("chat-event", msg(icons.fire, profile.name+" has cleared all of his key parts from memory",0));
	});
	
	socket.on('chat-msg', function(data) {
		if(!currentChannel) return;
		if(spamFilter(socket.id)) return spamBlock(socket);
		
		var sendText = cleanValue(data, 250);
		if(data.length) io.to(currentChannel).emit("chat-event", msg('#'+profile.avatar, sendText, 0, profile.name));
	});
	
	socket.on('lobby-generateMultisig', function(ringsize, generateWallets) {
		generateWallets = parseInt(generateWallets);
		if(!currentChannel || !ringsize.length || generateWallets < 100 || generateWallets > generateWalletsMax) return socket.emit('chat-event', msg(icons.warning, "Corrupted data - please try reloading the website", 1));
		if(spamFilter(socket.id)) return spamBlock(socket);
		
		var room = currentChannel, sigSize = parseInt(ringsize), numUsers = io.nsps['/'].adapter.rooms[room].length;
		if(sigSize <= 1 || sigSize > numUsers) return socket.emit('chat-event', msg(icons.warning, "Invalid ringsize - it can never be greater than the amount of attendees and must be 2 or 3", 1));
		io.to(room).emit("chat-event", msg(icons.screwdriver, generateWallets+" multisig wallets are being created on demand of "+profile.name+".<br>There are "+numUsers+" attendees and the wallets will be accessible by pairs of "+sigSize+".<br>Please stand by, this process may take some time.", 0));
		
		generateMultisig(numUsers, sigSize, generateWallets, function(result) {
			if(!result || !result.wallets.length) return io.to(room).emit("chat-event", msg(icons.warning, "An error has occured and no wallet could be created", 0));
			var ordereredSockets = [];
			for (var socketId in io.nsps['/'].adapter.rooms[room].sockets) {
				ordereredSockets.push(socketId);
			}
			if(ordereredSockets.length != result.userKeys.length) return io.to(room).emit("chat-event", msg(icons.warning, "The amount of attendees does not equal the amount of generated keys",0));
			
			io.to(room).emit("chat-event", msg(icons.tick, numberWithCommas(generateWallets)+" multisig wallets have been created and can be downloaded now on the sidebar. You will need the whole file to restore any of its wallet."));
			var sessionID = crypto.randomBytes(32).toString('hex');
			for(var i=0;i<result.userKeys.length;i++) {
				var subResult = {meta:{attend:numUsers,size:sigSize, selfId:i, session:sessionID}, key:result.userKeys[i], wallets:[]};
				for(var o=0;o<generateWallets;o++) {
					var subWallet = clone(result.wallets[o]), subPads = {};
					for(var padLabel in result.wallets[o].pads) {
						if(padLabel.indexOf(i)!=-1) subPads[padLabel] = subWallet.pads[padLabel];
					}
					subWallet.pads = subPads;
					subResult.wallets.push(subWallet);
				}
				//console.log("Size of subresult: "+JSON.stringify(subResult).length);
				io.to(ordereredSockets[i]).emit("key-download", subResult);
			}
		});
	});
	
	socket.on('lobby-askFusion', function(data) {
		if(!currentChannel || !data.hasOwnProperty("key") || !data.hasOwnProperty("secret")) return socket.emit('chat-event', msg(icons.warning, "Corrupted data - please try reloading the website", 1));
		if(spamFilter(socket.id)) return spamBlock(socket);
		if(fusionRequestor.length>10) return socket.emit('chat-event', msg(icons.warning, "Heavy restoration load at the moment, please try again later!", 1));
		
		var key = data.key, privacy = (parseInt(data.secret)%2===1), room = currentChannel, validated = jsonCheck.validate(key, jsonSchema);
		if(validated.hasOwnProperty("errors") && validated.errors.length) {
			console.log(validated.errors);
			return socket.emit('chat-event', msg(icons.warning, "Your key part is empty, contains invalid data or is corrupted", 1));
		}
		
		var padContainer = [];
		for(var i=0;i<key.wallets.length;i++) padContainer[i] = key.wallets[i].pads;
		var selfItem = {meta:{session:key.meta.session, size:key.meta.size}, room:currentChannel, privacy:privacy, pads:padContainer, firstWallet:{address:key.wallets[0].address, viewkey:key.wallets[0].viewkey}, sockets:[], parts:[], keys:[]};

		var matched = false;
		for(var i=0;i<fusionRequestor.length;i++) {
			var item = fusionRequestor[i];
			if(item.sockets.indexOf(socket.id)!=-1 || (item.meta.session == selfItem.meta.session && item.parts.indexOf(key.meta.selfId) != -1 && item.room == selfItem.room)) return socket.emit("chat-event", msg(icons.warning, "This or another key part of yours is in memory already", 1));
			else if(item.room == selfItem.room && item.meta.session == selfItem.meta.session) matched = i;
		}
		
		var matchContainer = (matched!==false) ? fusionRequestor[matched] : selfItem;
		matchContainer.parts.push(key.meta.selfId);
		matchContainer.keys.push(key.key);
		if(matched===false || !matchContainer.privacy) matchContainer.sockets.push(socket.id);
		var needItems = matchContainer.meta.size-matchContainer.parts.length;
		
		var suffix = privacy ? "The restored seed will be available to this user only!" : "The restored seed will be available to every user who provides his key!";
		var sendText = profile.name+" has provided his part of the key for "+selfItem.meta.session+". ";
		if(needItems) sendText += needItems+" more part(s) required.";
		else if(needItems==0) sendText += "Restoration will start now and may take some time, please stand by...";
		if(matched===false) sendText += "<br><b>"+suffix+"</b>";
		if(needItems<0) sendText = "An error has occured and the restoration has been cancelled. Please try again!";
		io.to(room).emit("chat-event", msg(icons.recycle, sendText,0));
		
		if(needItems<0) {
			if(matched!==false) fusionRequestor.splice(matched, 1);
			return;
		} else if(matched===false) {
			return fusionRequestor.push(selfItem);
		} else if(needItems==0) {
			fusionRequestor.splice(matched, 1);

			fusionMultisig(matchContainer, function(result, ermsg) {
				if(!result) {
					io.to(room).emit("chat-event", msg(icons.warning, "The reversal of "+selfItem.meta.session+" has failed: "+ermsg, 0));
				} else {
					var beginStr = 'The reversal of '+selfItem.meta.session+' was successful and verified. All key parts have been erased from memory. ';
					if(matchContainer.privacy) {
						io.to(room).emit("chat-event", msg(icons.tick, beginStr+'The initiator will now receive the seed according to his announced privacy settings.', 0));
						io.to(matchContainer.sockets[0]).emit("wallet-download", result);
					} else {
						io.to(room).emit("chat-event", msg(icons.tick,  beginStr+'Every participant will receive the seed.', 0));
						for(var i=0;i<matchContainer.sockets.length;i++) {
							io.to(matchContainer.sockets[i]).emit("wallet-download", result);
						}
					}
				}
			});
		} else {
			fusionRequestor[matched] = matchContainer;
		}
	});
});

// #######################################

function clone(obj) {
	if (null == obj || "object" != typeof obj) return obj;
    var copy = obj.constructor();
    for (var attr in obj) {
        if (obj.hasOwnProperty(attr)) copy[attr] = obj[attr];
    }
    return copy;
}

function spamFilter(id) {
	if(antiSpam[id]>2) return true;
	antiSpam[id]++;
	return false;
}

function spamBlock(socket) {
	return socket.emit('chat-event', msg(icons.hourglass, "Too many actions - keep it slow and retry in a few seconds!", 1));
}

function msg(avatarSrc, msg, isPrivate, username) {
	if(typeof username === 'undefined') username = "server";
	return {type:username=="server" ? "server" : "user", avatar:avatarSrc, message:msg, user:username, secret:isPrivate};
}

function clearFusion(removeId, room) {
	var changed = false;
	if(typeof room === 'undefined') room = false;
	for(var i=fusionRequestor.length-1;i>=0;i--) {
		var item = fusionRequestor[i];
		if(item.socket == removeId) {
			if((room && room == item.room) || room === false) {
				fusionRequestor.splice(i, 1);
				changed = true;
			}
		}
	}
	return changed;
}

function fusionMultisig(container, callback) {
	runWorker({type:"fusion", container:container}, callback);
}
function generateMultisig(usersAttend, usersRequired, numWallets, callback) {
	runWorker({type:"generate", attending:usersAttend, required:usersRequired, amount:numWallets}, callback);
}

function runWorker(object, callback) {
	var worker = child.fork("./children-worker.js");
	worker.on("message", function(result) {
		worker.kill('SIGINT');
		callback(result.result, result.error);
	});
	worker.send(object);
}

function generateProfile() {
	do {
		var seedHex = crypto.randomBytes(4).toString('hex'), avatarHex = seedHex.substr(0,6);
		var name = inc.hexToWords(seedHex).replace(/ /g,"-").toUpperCase();
		
		var exists = false;
		for(var key in socketIdentity) {
			if(!socketIdentity.hasOwnProperty(key)) continue;
			var item = socketIdentity[key];
			if(item.name == name) exists = true;
		}
	} while(exists);
	return {name:name, avatar: avatarHex};
}

function cleanValue(input, maximum) {
	var tmp = input.replace(/[^\w !\?\.\-\(\)"]/g, "").trim();
	if(tmp.length > maximum) return tmp.substr(0, maximum)+"...";
	else return tmp;
}

function numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
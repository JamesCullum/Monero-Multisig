var socket = io("https://monero-merchants.com", {autoConnect: false}), lobbyStatus = false, restoreData = false;
var debug = false, hashRoom = window.location.hash, crc32Handle = crc32(), lobbyUsers = 0;

$(document).ready(function() {
	try {
		var isFileSaverSupported = !!new Blob;
	} catch (e) {
		console.error("Browser doesn't support blob");
		return $(".start").removeClass("btn-primary").addClass("btn-danger").text("Incompatible Browser :(").click(function() {
			alert("Your browser does not support a function that allows you to generate and download big files in your browser. Please upgrade your browser and try again!");
		});
	}
	
	// ui
	$("#lobby-join").click(function() {
		var room = cleaned($("#lobby-name").val());
		if(!room.length) return alert("Please enter a valid lobby name");
		if(!lobbyStatus) {
			$(this).attr("disabled", "disabled");
			$("#status").text("Joining...");
			$("#lobby-name").attr("disabled", "disabled");
			socket.emit("lobby-join", room);
		} else {
			$(this).attr("disabled", "disabled");
			$("#status").text("Disconnecting...");
			socket.emit("lobby-leave");
		}
	});
	$("#generate").click(function() {
		socket.emit("lobby-generateMultisig", $("#sigSize").val(), $("#numWallets").val());
	});
	$("#fusionData").change(function(evt) {
		var files = evt.target.files, file = files[0];           
		var reader = new FileReader();
		reader.onload = function() {
			var temp = JSON.parse(this.result);
			if(!temp.hasOwnProperty("meta") || !temp.hasOwnProperty("wallets")) return alert("This is not a valid multisig key file");
			restoreData = temp;
			$("#fusionStart").removeAttr("disabled");
			$("#pickFusionFile").html("Key ready &#10004;");
		}
		reader.readAsText(file);
	});
	$("#fusionStart").click(function() {
		socket.emit("lobby-askFusion", {key:restoreData,secret:$("#share").is(":checked") ? 1 : 0});
		$("#fusionClear").removeAttr("disabled");
		addChat({type:"server",avatar:"images/gear-48.png",message:"Your key part is being uploaded and validated. Depending on the number of wallets this may take some time, please stand by.", secret:1});
	});
	$("#fusionClear").click(function() {
		socket.emit("lobby-clearFusion");
		$("#fusionData").val("");
		$("#pickFusionFile").text("Select File");
		$("#fusionStart, #fusionClear").attr("disabled", "disabled");
		restoreData = false;
	});
	$("#pickFusionFile").click(function() {
		$("#fusionData").click();
	});
	$(".sendText").click(function() {
		var tagteam = $(this).closest(".panel-footer").find(".sendText_Content");
		var sendText = cleaned(tagteam.val());
		if(sendText.length) socket.emit("chat-msg", sendText);
		tagteam.val("");
	});
	$(".sendText_Content").on('keyup', function (e) {
		if(e.keyCode == 13) $(this).closest(".panel-footer").find(".sendText").click();
	});
	$(".start").click(function() {
		$("#explaination").hide();
		socket.connect();
		$(".current-chat-area").attr("style", "max-height:85vh; max-height:calc(100% - 55px); min-height:auto");
		$(".current-chat-footer").show();
		$("#list-about").addClass("collapsed").find("> .title").show();
		$("#list-start").hide();
		$("#list-status").show();
	});
	$("input[type=number][min][max]").keyup(function() {
		var num = parseInt($(this).val()), min = parseInt($(this).attr("min")), max = parseInt($(this).attr("max"));
		if(num < min) $(this).val(min);
		else if(num > max) $(this).val(max);
	});
	$("#numWallets").change(function() {
		$("#generateIndex").attr("max", $(this).val()).keyup();
	});	
	
	// ui elements
	$(".list-group-item > .title, .list-group-item > small").click(function() {
		var listItem = $(this).closest(".list-group-item");
		if(listItem.hasClass("disabled")) return;
		listItem.hasClass("collapsed") ? listItem.removeClass("collapsed") : listItem.addClass("collapsed");
	});
	$("button").click(function(e) {
		e.preventDefault();
		$(this).blur();
	});

	// socket code
	socket.on('set-profile', function(data) {
		$("#username").text(data.name);
		$("#ownColor").css("background-color", data.avatar).text(getShortname(data.name));
		$("#list-lobby").removeClass("disabled collapsed");
		$("#status").text("Standby for lobby join");
		
		addChat({type:"server",avatar:"images/gear-48.png",message:"You have been assigned a random username and avatar. Please connect to a lobby of your choice and use this window to chat!", secret:1});
		
		if(debug || hashRoom) {
			$("#lobby-name").val(hashRoom || "a");
			$("#lobby-join").click();
		}
	});
	socket.on('lobby-change', function(data) {
		if(data) {
			window.location.hash = "#"+data;
			$("#status").text("In Lobby");
			$("#lobby-join").text("Disconnect").removeClass("btn-primary").addClass("btn-danger");
			$("#lobby-join, #generate, .sendText_Content, .sendText").removeAttr("disabled");
			$("#lobby-name").val(data);
			lobbyStatus = true;
			$("#list-generate, #list-restore").removeClass("disabled");
			$("#list-lobby").addClass("collapsed");
			$("#list-generate").removeClass("collapsed");
		} else {
			window.location.hash = "";
			$("#status").text("Standby for lobby join");
			$("#lobby-join").text("Connect");
			$("#lobby-name").val("");
			$("#lobby-join, #lobby-name").removeAttr("disabled");
			$("#generate, #fusionStart, .sendText_Content, .sendText").attr("disabled", "disabled");
			$("#list-generate, #list-restore").addClass("disabled collapsed");
			$("#download").attr("href","#");
			$("#pickFusionFile").text("Select File");
			$("#fusionData").val("");
			lobbyStatus = false;
			restoreData = false;
		}
	});
	socket.on('chat-event', function(data) {
		addChat(data);
	});
	socket.on('key-download', function(data) {
		var room = cleaned($("#lobby-name").val()), stringed = JSON.stringify(data);
		$("#download").attr("download", data.meta.session+"-"+data.meta.selfId+".json");
		$("#download").attr("href", window.URL.createObjectURL(new Blob([stringed], {type: 'octet/stream'})));
		$("#download").removeClass("disabled");
		
		var index = parseInt($("#generateIndex").val())-1;
		if(index <= 0 || index >= data.wallets.length) {
			addChat({type:"server",avatar:"images/flame-48.png",message:'Your chosen wallet index is most likely incorrect. You can either change it now and initiate a new ceremony, or download the file and extract the address and viewkey for the specified wallet index using a JSON Viewer.', secret:1});
		} else {
			var wallet = data.wallets[index];
			addChat({type:"server",avatar:"images/check-48.png",message:"The address of wallet index "+(index+1)+' is "'+wallet.address+'", the viewkey is "'+wallet.viewkey+'"', secret:1});
		}
	});
	socket.on('wallet-download', function(data) {
		var index = parseInt($("#fusionIndex").val())-1;
		if(index >= data.length) index = 0;
		var wallet = data[index], wordSeed = hexToWords(wallet), words = wordSeed.split(" ");
		
		var trimmed_words = "";
		for (var i = 0; i < words.length; i++) trimmed_words += words[i].slice(0, 3);
		var checksum = crc32Handle.run(trimmed_words);
		wordSeed += " "+words[checksum % words.length];
		
		var privSpend = cnUtil.sc_reduce32(wallet), privView = cnUtil.sc_reduce32(cnUtil.cn_fast_hash(privSpend));
		var pubSpend = cnUtil.sec_key_to_pub(privSpend), pubView = cnUtil.sec_key_to_pub(privView);
		var address = inc.keysToAdr(pubSpend, pubView);
		
		var restoreText = "The address for wallet index "+(index+1)+' is "'+address+'", the seed is "'+wordSeed+'"';
		if(index <= 0) restoreText += ". WARNING: This is the seed for the default wallet as you entered a most likely invalid wallet index. This may not be the seed for the correct wallet. If it is not, change the index and restart the ceremony";
		addChat({type:"server",avatar:"images/check-48.png", message:restoreText, secret:1});
	});
	
	if(debug || hashRoom) $(".start").click();
});

function cleaned(val) {
	return val.replace(/[^\w !\?\.\-\(\)"]/g, "").trim();
}

function addChat(object) {
	var avatar = object.type=="user" ? '<div class="img-circle avatar pull-left" style="background-color:'+object.avatar+'">'+getShortname(object.user)+'</div>' : '<img class="media-object img-circle pull-left" src="'+object.avatar+'">';
	var username = object.type=="user" ? object.user : "Server Message";
	var flair = object.secret ? '<span class="label label-success" title="Only you can see this message">Private</span>' : '<span class="label label-info" title="Everybody in the room can see this message">Public</span>';
	var timestamp = new Date().toLocaleString();
	
	$("#chatList").append('<li class="media">\
								<div class="media-body">\
									<div class="media">\
										'+avatar+'\
										<div class="media-body">\
											'+object.message+'\
											<br><small class="text-muted"> '+username+' | '+timestamp+' '+flair+'</small>\
										</div>\
									</div>\
								</div>\
							</li>');
	$(".current-chat-area").scrollTop($(".current-chat-area")[0].scrollHeight);
}

function getShortname(name) {
	var shorted = '', regex = /([A-Z])[A-Z]+/g, match = regex.exec(name);
	while (match != null) {
		shorted += match[1];
		match = regex.exec(name);
	}
	return shorted.toUpperCase();
}

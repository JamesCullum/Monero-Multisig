var crypto = require("crypto"), inc = require("./static/js/inc"), words = inc.words, CRC32 = inc.crc32(), cnUtil = inc.cnUtil;

setTimeout(function() {
	process.exit(); // kill if not finished after 1 hr
}, 60*60*1000);

process.on('message', function(data) {
	if(data.type == "generate") {
		generateMultisig(data.attending, data.required, data.amount, function(result, ermsg) {
			process.send({result:result, error:ermsg});
		});
	} else if(data.type == "fusion") {
		fusionMultisig(data.container, function(result, ermsg) {
			process.send({result:result, error:ermsg});
		});
	}
});

function fusionMultisig(matched, callback) {
	var padIndex = false, returnWallets = [];
	
	for(var padLabel in matched.pads[0]) {
		var padLabelSplit = padLabel.split("");
		var padMatches = 0;
		for(var o=0;o<matched.parts.length;o++) {
			if(padLabelSplit.indexOf(matched.parts[o].toString())!=-1) padMatches++;
		}
		if(padMatches == matched.meta.size) {
			padIndex = padLabel;
			break;
		}
	}
	if(padIndex===false) return callback(false, "Pad combination doesn't exist");
	
	for(var i=0;i<matched.pads.length;i++) {
		matched.keys.push(Buffer.from(matched.pads[i][padIndex], 'base64').toString('utf8'));

		var seed = xor(matched.keys);
		matched.keys.pop();
		
		if(i == 0) {
			var privSpend = cnUtil.sc_reduce32(seed), privView = cnUtil.sc_reduce32(cnUtil.cn_fast_hash(privSpend))
			if(privView != matched.firstWallet.viewkey) return callback(false, "Wrong input - checksum failed");
		}
		returnWallets.push(seed);
	}
	if(returnWallets.length < 100) return callback(false, "Unsafe amounts of wallets");
	if(typeof callback !== 'undefined') callback(returnWallets, false);
	return returnWallets;
}

function generateMultisig(usersAttend, usersRequired, numWallets, callback) {
	var result = {userKeys:[], wallets:[]};
	for(var i=0;i<usersAttend;i++) result.userKeys[i] = crypto.randomBytes(32).toString('hex');
	
	for(var w=0;w<numWallets;w++) {
		var wallet = {address:null,viewkey:null,pads:{}};
		var seed = crypto.randomBytes(32).toString('hex');
		var privSpend = cnUtil.sc_reduce32(seed), privView = cnUtil.sc_reduce32(cnUtil.cn_fast_hash(privSpend));
		var pubSpend = cnUtil.sec_key_to_pub(privSpend), pubView = cnUtil.sec_key_to_pub(privView);
		wallet.address = inc.keysToAdr(pubSpend, pubView);
		wallet.viewkey = privView;

		var pairs = [];
		for(var i=0;i<usersAttend;i++) { // calculate for every user
			pairs[i] = [];
			
			for(var o=0;o<usersAttend;o++) { // calculate against every user
				var temp = [{label:i, content:result.userKeys[i]}];
				for(var p=1;p<usersRequired;p++) { // how big the pairs have to be
					var index = (o+p) % usersAttend;
					if(index == i) continue;
					temp.push({label:index, content:result.userKeys[index]});
				}
				if(temp.length != usersRequired || (usersRequired==1 && o>0)) continue;
				pairs[i].push(temp);
			}
		}

		for(var i=0;i<pairs.length;i++) { // every user
			for(var o=0;o<pairs[i].length;o++) { // every pair for this user
				var encVals = [seed], tempNames = "";
				for(var p=0;p<pairs[i][o].length;p++) { // every element in pair
					encVals.push(pairs[i][o][p].content);
					tempNames += pairs[i][o][p].label;
				}
				var pad = xor(encVals);
				var padBase = new Buffer(pad).toString('base64');
				tempNames = tempNames.split("").sort().join("");
				
				wallet.pads[tempNames] = padBase;
			}
		}
		
		result.wallets.push(wallet);
	}
	
	if(typeof callback !== 'undefined') callback(result, false);
	return result;
}

function xor(obj) {
	if(obj.length<=1) return console.error("xor needs a minimum of two elements");
	var resAr = [], resStr = "";
	for (var i = 0; i < obj[0].length; i++) {
		var calc = obj[0].charCodeAt(i);
		for(var o=1;o<obj.length;o++) calc = calc ^ obj[o].charCodeAt(i);
		//var calc = a.charCodeAt(i) ^ b.charCodeAt(i) ^ c.charCodeAt(i);
		resAr.push(calc);
		resStr += String.fromCharCode(calc);
	}
	return resStr;
}
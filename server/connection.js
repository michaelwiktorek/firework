'use strict';

var path = require('path');
var game = require(path.join(__dirname, 'game.js'));
var exports = module.exports = {};


/**
* Connection
* Model for a single user-connection to the server.
* Has references to the global data variable, where 
* server-wide game and player data is stored.
* Defines event handlers for its associated socket
*/
class Connection {
    constructor(name, socket, data) {
	this.name = name;
	this.game_id = 0; // indicates that user is not associated with a game
	this.socket = socket;
	this.host = false;
	this.data = data;
	this.games = data["games"];
	this.my_game = undefined;
    }

    // associate events with handlers
    init_handlers() {
	this.socket.on('disconnect', this.disconnect.bind(this));
	this.socket.on('newgame_request', this.newgame_request.bind(this));
	this.socket.on('joingame_request', this.joingame_request.bind(this));
	this.socket.on('chat_message', this.chat_message.bind(this));
	this.socket.on('startgame', this.startgame.bind(this));
	this.socket.on('action', this.handle_action.bind(this));
	this.socket.on('request_knowledge', this.handle_knowledge.bind(this));
    }

    //--- Helpers ---
    // emit event to all players in this game
    broadcast(event, msg) {
	for (let playername of Object.keys(this.my_game["players"])) {
	    this.my_game.players[playername].emit(event, msg);
	}
    }

    // call callback for each player in this game
    foreach_ingame(callback) {
	for (let playername of Object.keys(this.my_game["players"])) {
	    callback(playername, this.my_game["players"][playername]);
	}
    }

    // add list of players to object (create object if undefined)
    add_playerlist(response) {
	if (response == undefined) {
	    response = {};
	}
	response["playerlist"] = Object.keys(this.my_game["players"]);
	return response;
    }
    
    // --- Event Handlers ---
    disconnect() {
	var self = this;
	if (this.my_game != undefined){ // in lobby or in game
	    if (this.my_game["model"].state == "running") { // in game
		//this.my_game["model"].state = "dead";
		this.foreach_ingame(function(playername, playersocket){
		    if (playername != self.name) {
			playersocket.emit("chat_notify", self.name + " left the game");
		    }
		});
		this.broadcast("update_playerlist", JSON.stringify(this.add_playerlist()));
	    } else if (this.my_game["model"].state == "lobby") { // in lobby
		// if host, mark game dead and send error
		if (this.host){
		    this.my_game["model"].state = "dead";
		    this.foreach_ingame(function(playername, playersocket){
			playersocket.emit("error_fatal", "Host left the lobby");
		    });
		}
		// if joiner, remove self from lobby and update playerlist
		delete this.my_game["players"][this.name];
		this.broadcast("update_playerlist", JSON.stringify(this.add_playerlist()));
	    } else if (this.my_game["model"].state == "done") {
		delete this.my_game["players"][this.name];
		this.broadcast("update_playerlist", JSON.stringify(this.add_playerlist()));
		if (Object.keys(this.my_game["players"]).length == 0) {
		    delete this.data[this.game_id];
		}
	    }
	}
    }

    newgame_request(msg) {
	var json_msg = JSON.parse(msg);
	this.name = json_msg["name"];
	if (this.name == "") {
	    this.socket.emit("error_recov", "Name field must not be empty!");
	    return false;
	}
	this.game_id = this.data["id_incr"];
	this.data["id_incr"] += 1;
	this.games[this.game_id] = {};
	this.my_game = this.games[this.game_id];
	this.my_game["model"] = new game.Game();
	this.my_game["players"] = {[this.name]: this.socket};

	var json_response = JSON.stringify({name:this.name,
					    id:this.game_id.toString()});
	this.socket.emit("newgame_confirm", json_response);
	this.socket.emit("update_playerlist", JSON.stringify(this.add_playerlist()));
	this.host = true;
    }

    joingame_request(msg) {
	var json_msg = JSON.parse(msg);
	this.name = json_msg["name"];
	this.game_id = parseInt(json_msg["id"]);
	var self = this;
	if (!(this.game_id in this.games)) {
	    this.socket.emit("error_recov", "Game does not exist");
	    return 0;
	}
	// get the correct game
	this.my_game = this.games[this.game_id];
	if (this.my_game["model"].state != "lobby") {
	    // if player is in game but their socket is not connected
	    // they left, and we should consider this a "rejoin"
	    // send gamestate from model to rejoiner with "startgame" event
	    if (this.name in this.my_game.players && !this.my_game.players[this.name].connected) {
		this.foreach_ingame(function(playername, playersocket){
		    if (playername != self.name) {
			playersocket.emit("chat_notify", self.name + " has rejoined");
		    }
		});

		this.my_game.players[this.name] = this.socket;
		this.socket.emit("joingame_confirm", JSON.stringify({}));
		this.broadcast("update_playerlist", JSON.stringify(this.add_playerlist()));
		
		let state = this.my_game.model.get_state();
		var hand = state["players"][this.name];
		delete state["players"][this.name];
		state.rejoin = true;
		
		this.socket.emit("startgame", JSON.stringify(state));
	    } else {
		this.my_game = undefined;
		this.socket.emit("error_recov", "Game is not joinable!");
	    }
	   
	    return 0;
	}
	// make sure players have unique names
	if (this.name in this.my_game["players"]) {
	    this.my_game = undefined;
	    this.socket.emit("error_recov", "Player with this name already exists");
	} else if (this.name == "") {
	    this.my_game = undefined;
	    this.socket.emit("error_recov", "Name field must not be empty!");
	} else {
	    this.my_game.players[this.name] = this.socket;
	    this.socket.emit("joingame_confirm", JSON.stringify({}));
	    this.broadcast("update_playerlist", JSON.stringify(this.add_playerlist()));
	}
	
    }
    
    // rebroadcast chat message to all players in this game
    chat_message(msg) {
	this.broadcast("chat_message", msg); 
    }

    startgame(msg) {
	var game_players = Object.keys(this.my_game["players"]);
	var start_state = this.my_game["model"].startgame(game_players);
	this.state_update(start_state, "startgame");
    }

    state_update(state, event) {
	this.foreach_ingame(function(playername, playersocket) {
	    // for each player, delete their hand from the state
	    // then send the state, then add the hand back in
	    // ensuring that no player receives their own hand
	    if ("players" in state) {
		var hand = state["players"][playername];
		delete state["players"][playername];
		playersocket.emit(event, JSON.stringify(state));
		state["players"][playername] = hand;
	    } else {
		playersocket.emit(event, JSON.stringify(state));
	    }
	});
    }

    handle_action(msg) {
	var json_msg = JSON.parse(msg);
	var response = {};
	if (json_msg.action == "play"){
	    response = this.my_game.model.player_play(this.name, json_msg.index); 
	} else if (json_msg.action == "discard") {
	    response = this.my_game.model.player_discard(this.name, json_msg.index);
	} else if (json_msg.action == "inform") {
	    response = this.my_game.model.player_inform(json_msg);
	    if (Object.keys(response).length == 0) {
		this.socket.emit("error", "No tokens left. You shouldn't see this?");
		return;
	    } else {
		response.inform = {name: json_msg.name, data: json_msg.data};
	    }
	}
	this.state_update(response, "update");
    }

    handle_knowledge(msg) {
	let json_msg = JSON.parse(msg);
	let name = json_msg.name;
	let response = {knowledge: this.my_game.model.get_knowledge(name)}
	this.socket.emit("update", JSON.stringify(response));
    }
}

exports.Connection = Connection;

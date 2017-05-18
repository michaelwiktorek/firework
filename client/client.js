'use strict';

var $ = require('jquery');
var io = require('socket.io-client');
var board = require("./board.js");
var exports = module.exports = {};

// Handles connection and game interaction client-side
class Client {
    constructor() {
	this.name = "";
	this.game_id = 0;
	this.host = (window.location.pathname == "/");
	this.playerlist = [];
	this.check_host();
	this.hide_game_board();
    }

    // Check if this client started the game
    check_host() {
	this.host = (window.location.pathname == "/");
	this.request = "newgame_request";
	this.confirm = "newgame_confirm";
	if (!this.host) {
	    this.request = "joingame_request";
	    this.confirm = "joingame_confirm";
	    this.game_id = window.location.pathname.substring(1);
	    $("#name_button").text("join game");
	}
    }

    hide_game_board() {
	$("#chat_container").hide();
	$("#playerlist_container").hide();
	$("#game_area").hide();
	$("#turn").hide();
	$("#tokens").hide();
	$("#fuse").hide();
	$("#board").hide();
	$("#discard").hide();
	$("#decksize").hide();
	$("#game_over").hide();
	$("#next_turn").hide();
	$("#playername").focus();
    }

    connect() {
	this.socket = io();
	this.init_handlers();
    }

    init_handlers() {
	$("#start_form").submit(this.game_request_click.bind(this));
	this.socket.on("error_recov", this.error_recov.bind(this));
	this.socket.on("error_fatal", this.error_fatal.bind(this));
	this.socket.on(this.confirm, this.lobby_confirm.bind(this));
	this.socket.on("startgame", this.startgame.bind(this));
	this.socket.on("update_playerlist", this.update_playerlist.bind(this));
	this.socket.on("update", this.update.bind(this));
    }

    // --- Handlers ---
    // handle recoverable error: just alert error text
    error_recov(msg){
	alert(msg);
    }

    // handle fatal error: (for now) alert error text,
    // then load error page
    error_fatal(msg){
	//alert(msg);
	window.location.href = window.location.origin + "/error";
    }

    // handles "join/new game" click
    game_request_click(event){
	event.preventDefault();
	var name_el = $("#playername");
	this.name = name_el.val();
	var msg = "";
	if (this.host) {
	    msg = JSON.stringify({name:this.name});
	} else {
	    msg = JSON.stringify({name:this.name, id:this.game_id});
	}
	this.socket.emit(this.request, msg);
	name_el.val('');
    }

    // handles confirmation from server on "join/new game"
    lobby_confirm(msg){
	var self = this;
	var json_msg = JSON.parse(msg);
	this.game_id = json_msg["id"];
	if (this.host) {
	    var url_box = $("#game_url");
	    url_box.text("Game url: " + window.location.href + this.game_id);
	    url_box.append($('<div>')
			   .append($('<button>').text("start game"))
			   .attr("id", "start_button"));
	    $("#start_button").click(function(){
		if (playerlist.length < 2 || playerlist.length > 5) {
		    alert("Need 2-5 players");
		} else {
		    self.socket.emit("startgame", JSON.stringify({id:self.game_id}));
		}
	    });   
        }
	$("#start_form").hide();
	this.chat_init();
    }

    // update playerlist
    update_playerlist(msg){
	this.playerlist = JSON.parse(msg)["playerlist"];
	$("#playerlist").text(this.playerlist.toString());
    }

    // Handle startgame message from server
    startgame(msg){
	// show game area, hide start area
	$("#title").hide();
	$("#start_area").hide();
	var startstate = JSON.parse(msg);
	console.log(startstate);

	$("#game_area").show();
	$("#tokens").show();
	$("#fuse").show();
	$("#board").show();
	$("#discard").show();
	$("#decksize").show();
	$("#next_turn").show();
	$("#chat_stuff").css("margin-top", "50px");
	$("#centerbox").css("display","inline-block");
	this.game_board = new board.Board(startstate, this);
    }

    // update client game state
    update(msg) {
	var state = JSON.parse(msg);
	this.game_board.update(state);
    }


    // --- Handler Helpers
    // Initialize chat after newgame_confirm
    chat_init(){
	var self = this;
	$("#chat_container").show();
	$("#playerlist_container").show();

	// --- Chat ---
	$("#chat_box").focus();
	$("#chat_form").prepend($('<label>').text(this.name + ": "));
	$("#chat_form").submit(function(event) {
	    event.preventDefault();
	    var chat_box = $("#chat_box");
	    var text = chat_box.val();
	    var message = JSON.stringify({name:self.name, chat:text, id:self.game_id});
	    self.socket.emit("chat_message", message);
	    chat_box.val("");
	});

	self.socket.on("chat_message", function(msg) {
	    var json_msg = JSON.parse(msg);
	    var msg_name = json_msg["name"];
	    var msg_chat = json_msg["chat"];
	    var messages = $("#messages");
	    messages.append($('<li>').text(msg_name + ": " + msg_chat));
	    messages.scrollTop(messages.prop("scrollHeight"));
	});
    }
}

exports.Client = Client;

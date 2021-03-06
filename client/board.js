'use strict';

var $ = require("jquery");
var player_lib = require("./player.js");
var card_lib = require("./card.js");

exports = module.exports = {};

// Holds the state of the game on the client side
// list of players and their hands (excluding own)
// decksize, num tokens, fuse length
// discard pile and stacks of played cards
// one's own knowledge of one's hand
class Board {
    constructor(state, client) {
	this.updates = { fuse:      this.update_fuse.bind(this),
			 decksize:  this.update_decksize.bind(this),
			 newhand:   this.update_newhand.bind(this),
			 board:     this.update_stacks.bind(this),
			 discard:   this.update_discard.bind(this),
		         tokens:    this.update_tokens.bind(this),
		         turn:      this.update_turn.bind(this),
		         done:      this.update_done.bind(this),
		         inform:    this.update_inform.bind(this),
		         nextturn:  this.update_nextturn.bind(this),
		         knowledge: this.update_knowledge.bind(this)};
	
	this.client = client;
	this.socket = client.socket;

	this.discard  = [];
	this.stacks   = [];
	this.decksize = state.decksize;
	this.tokens   = state.tokens;
	this.fuse     = state.fuse;
	this.turn     = state.turn;
	this.hand     = [];

	this.board_color_order = [];
	this.discard_color_order = [];

	this.game_area = $("#game_area");
	this.players_area = $("#players");

	this.players = this.construct_playerlist(state.players);
	this.construct_controls();

	// this.update_turn({turn: this.turn});
	// this.update_nextturn({nextturn: state.nextturn});
	// $("#decksize").text("decksize: " + this.decksize.toString());
	this.update(state);
    }

    // construct list of player objects from state data
    construct_playerlist(player_data) {
	var playerlist = [];
	for (let playername of Object.keys(player_data)) {
	    let player_div = $('<div>').text(playername).addClass("player_div");
	    this.players_area.append(player_div);
	    
	    let player_obj = new player_lib.Player(playername, [], player_div);
	    
	    for (let card of player_data[playername]) {
		let dom = this.render_card(card, true);
		let new_card = new card_lib.Card(card, dom, player_obj, this);
		player_obj.hand.push(new_card);
		player_div.append(dom);
	    }
	    playerlist.push(player_obj);
	}
	return playerlist;
    }

    // Construct game controls for the client
    construct_controls() {
	this.construct_token_btn();
	for (var i = 0; i < 4; i++) {
	    var div = $('<div>');
	    this.game_area.append(div);
	    this.hand.push(new card_lib.Hidden_Card(div, this, i));
	}
    }

    // make the spend token button work
    construct_token_btn() {
	var self = this;
	var token_btn = $('<button>')
	    .text("Spend Token")
	    .css("display", "inline-block")
	    .addClass("token");
	var btn_container = $('<div>').css("display", "inline-block");
	this.game_area.append(btn_container.append(token_btn));
	token_btn.click(function(){
	    var token = this;
	    if (self.turn != self.client.name) {
		return;
	    }
	    if (self.tokens < 1) {
		alert("Out of tokens, try a different action");
		return;
	    }
	    $(this).text("Click another player's card");
	    $(this).prop("disabled", true);
	    self.disable_card_controls();
	    var cancel_btn = $('<button>')
		.text("Cancel")
		.css("display", "inline-block")
		.addClass("cancel");
	    btn_container.append(cancel_btn);

	    // set mouseover on player cards
	    $(".in_hand").mouseover(function() {
		$(this).css("border", "2px black dashed");
		$(this).css("margin", "2px");
	    }).mouseout(function() {
		$(this).css("border", "1px black solid");
		$(this).css("margin", "3px");
	    });

	    // define card click behavior
	    for (let player of self.players) {
		if (player.name == self.client.name) {
		    continue;
		}
		var data = {};
		for (let card of player.hand) {
		    card.dom.click(function() {
			$(this).children("button").show();
			cancel_btn.prop("disabled", true);
		    });
		}
	    }
	    
	    cancel_btn.click(function() {
		$(".in_hand").unbind("mouseover mouseout click");
		token_btn.text("Spend Token");
		$(this).remove();
		$(token).prop("disabled", false);
		self.enable_card_controls();
	    });
	});
    }

    disable_card_controls() {
	for (let card of this.hand) {
	    card.disable_buttons();
	}
    }

    enable_card_controls() {
	for (let card of this.hand) {
	    card.enable_buttons();
	}
    }

    // empties "container" and renders a list of cards
    render_cardlist(cardlist, container) {
	container.children(".player_card").remove();
	for (let card of cardlist) {
	    container.append(this.render_card(card));
        }
    }

    // renders "cardlist" into ordered stacks divided by color
    render_gameboard(cardlist, container, discard=false) {
	container.children(".player_card").remove();
	// begin by sorting cardlist by number
	cardlist.sort(function(a, b) {
	    return a.number - b.number;
	});
	let init_width = 50;
	var board_map = {};
	let color_order;
	if (discard) {
	    color_order = this.discard_color_order;
	} else {
	    color_order = this.board_color_order;
	}
	for (let card of cardlist) {
	    let card_dom = this.render_card(card);
	    if (discard) {
		card_dom.addClass("discarded_card");
	    }
	    if (card.color in board_map) { // add to pile
		let top_card = board_map[card.color].find(".player_card").last();
		if (top_card.length == 0) {
		    top_card = board_map[card.color];
		}
		top_card.append(card_dom);
		// make base card as wide as all children
		if (discard) {
		    let bot_width = board_map[card.color].width();
		    if (bot_width == 0) {
			bot_width = init_width;
		    }
		    board_map[card.color].width(bot_width + 20);
		}
	    } else { // make new pile
		board_map[card.color] = card_dom;
		// store discard piles in persistent order
		if (color_order.indexOf(card.color) < 0) {
		    color_order.push(card.color);
		}
	    }
	}
	for (let color of color_order) {
	    container.append(board_map[color]);
	}
    }

    // returns a 
    render_card(card, in_hand=false) {
	let output = $('<div>')
	    .addClass("player_card")
	    .css("background-color", card.color)
	    .append($('<span>').text(card.number).addClass("num_label"))
	    .append($('<span>').addClass("color_known"));
	if (in_hand) {
	    output.addClass("in_hand");
	}
	return output;
    }

    // update board state based on state received from server
    update(state) {
	console.log(state);
	for (let update of Object.keys(state)) {
	    if (update in this.updates) {
		this.updates[update](state);
	    }
	}
	
    }
    
    // --- Update callbacks ---
    update_fuse(state) {
	this.fuse = state.fuse;
	$("#fuse").text("fuse: " + this.fuse.toString());
    }

    update_decksize(state) {
	this.decksize = state.decksize;
	$("#decksize").text("deck size: " + this.decksize.toString());
    }

    update_tokens(state) {
	this.tokens = state.tokens;
	$("#tokens").text("tokens: " + this.tokens.toString());
    }

    update_stacks(state) {
	this.stacks = state.board;
	this.render_gameboard(this.stacks, $("#board"));
    }

    // update player hands after someone draws a new card
    update_newhand(state) {
	var playerdata = state.newhand;
	for (let player of this.players) {
	    // if another player tried to draw
	    if (player.name == playerdata.name) {
		// remove card that was played/discarded
		let old_card = player.hand.splice(playerdata.old_index, 1)[0];
		old_card.dom.remove();
		// add new cards drawn (always just one)
		let new_cards = playerdata.newlist;
		for (let card of new_cards) {
		    let dom = this.render_card(card, true);
		    let new_card = new card_lib.Card(card, dom, player, this);
		    player.hand.push(new_card);
		    player.dom.append(dom);
		}
	    }
	}
	// if this client tried and failed to draw
	if (playerdata.name == this.client.name && playerdata.newlist.length == 0) {
	    this.hand.pop().dom.remove();
	}
    }

    update_discard(state) {
	this.discard = state.discard;
	//this.render_cardlist(this.discard, $("#discard"));
	this.render_gameboard(this.discard, $("#discard"), true);
    }

    update_turn(state) {
	this.turn = state.turn;
	if (this.turn == this.client.name) {
	    $("#turn").show();
	    $("#current_turn").hide();
	} else {
	    $("#turn").hide();
	    if (state.turn != "") {
		$("#current_turn").show().text("this turn: " + state.turn);
	    }
	}
	for (let player of this.players) {
	    if (player.name == this.turn) {
		player.dom.css("border", "1px #666666 dashed");
		player.dom.css("border-radius", "3px");
	    } else {
		player.dom.css("border", "none");
	    }
	}
    }

    update_nextturn(state) {
	if (state.nextturn == "") {
	    $("#next_turn").hide();
	} else {
	    $("#next_turn").text("next turn: " + state.nextturn);
	}
    }

    calculate_score(state) {
	var score = 0;
	if ("board" in state) {
	    score = state.board.length;
	} else {
	    score = this.stacks.length;
	}
	return score;
    }

    // state.inform.data: {property: "color/number",
    //                     value: "blue/4",
    //                     indices: [index1, index2, etc] }
    update_inform(state) {
	var data = state.inform.data;
	var property = data.property;
	var value = data.value;
	// mark other players' cards as known
	if (state.inform.name != this.client.name) {
	    for (let player of this.players) {
		if (player.name == state.inform.name) {
		    for (let index of data.indices) {
			if (property == "color") {
			    player.hand[index].set_color_known();
			} else if (property == "number") {
			    player.hand[index].set_number_known();
			}
		    }
		}
	    }
	} else {
	    // reveal own known cards
	    for (let index of data.indices) {
		if (property == "color") {
		    this.hand[index].set_color(value);
		} else if (property == "number") {
		    this.hand[index].set_number(value);
		}
	    }
	}
    }

    // get all players' knowledge about their own hands
    // then update DOM accordingly
    update_knowledge(state) {
	let knowledge = state.knowledge;
	console.log(knowledge);
	for (let player of Object.keys(knowledge)) {
	    if (player == this.client.name) {
		let data = knowledge[player];
		for (let index of Object.keys(data)) {
		    let card = data[index];
		    if ("color" in card) {
			this.hand[index].set_color(card.color);
		    }
		    if ("number" in card) {
			this.hand[index].set_number(card.number);
		    }
		}
	    } else {
		let data = knowledge[player];
		let color_indices = data.color;
		let number_indices = data.number;
		let client_player = this.players.filter(function(pl){
		    return pl.name == player;
		})[0];
		for (let index of color_indices) {
		    client_player.hand[index].set_color_known();
		}
		for (let index of number_indices) {
		    client_player.hand[index].set_number_known();
		}
	    }
	}
    }

    update_done(state) {
	if (state.done) {
	    var game_over = $("#game_over");
	    game_over.show();
	    game_over.text("Game Over! Score: " + this.calculate_score(state));
	}
    }
}

exports.Board = Board;

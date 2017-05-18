'use strict';

var exports = module.exports = {};


/**
* Game Module
* Model for server-side gameplay. Tracks entire game state,
* including data not available to players (i.e. deck order).
* Exported as "Game"
*/
class Card {
    constructor(color, number) {
	this.color = color;
	this.number = number;
    }
}

class Player {
    constructor(name, game) {
	this.game = game;
	this.name = name;
	this.hand = [];
	// if last_draw_failed is true, and we are about to draw,
	// end the game
	this.last_draw_failed = false;
    }

    // return: true if deck is empty, false otherwise
    draw_cards(number) {
	let new_cards = [];
	for (let i = 0; i < number; i++) {
	    if (this.hand.length < 4) {
		if (this.game.deck.size() == 0) {
		    this.last_draw_failed = true;
		    break;
		}
		let drawn = this.game.deck.draw();
		this.hand.push(drawn);
		new_cards.push(drawn);
	    }
	}
	return new_cards;
    }

    discard(index) {
	var card = this.hand.splice(index, 1)[0];
	this.game.discard.push(card);
	this.game.over = this.last_draw_failed;
	let new_cards = this.draw_cards(1);
	this.game.refund_token();
	this.game.change_turn();
	return new_cards;
    }

    place(index) {
	let card = this.hand.splice(index, 1)[0];
	let placed = this.game.board.attempt_place(card);
	this.game.over = false;
	if (!placed) {
	    this.game.over = this.game.over || this.game.fuse_tick();
	    this.game.discard.push(card);
	}
	if (card.number == 5) {
	    this.game.refund_token();
	}
	this.game.over = this.game.over || this.last_draw_failed;
	this.game.over = this.game.over || this.game.board.check_victory();
	let new_cards = this.draw_cards(1);
	this.game.change_turn();
	return new_cards;
    }
}

class Deck {
    constructor() {
	this.cards = [];
	this.colors = ["red", "green", "blue", "yellow", "white"];
	for (let i = 0; i < this.colors.length; i++) {
	    for (let j = 0; j < 3; j++) {
		this.cards.push(new Card(this.colors[i], 1));
	    }
	    for (let j = 0; j < 2; j++) {
		this.cards.push(new Card(this.colors[i], 2));
		this.cards.push(new Card(this.colors[i], 3));
		this.cards.push(new Card(this.colors[i], 4));
	    }
	    this.cards.push(new Card(this.colors[i], 5));
	}
	this.shuffle();
    }

    shuffle() {
	var m = this.cards.length;
	var t;
	var i;

	while (m) {
	    i = Math.floor(Math.random() * m);
	    m -= 1
	    t = this.cards[m];
	    this.cards[m] = this.cards[i];
	    this.cards[i] = t;
	}
    }

    draw() {
	return this.cards.splice(-1, 1)[0];
    }

    size() {
	return this.cards.length;
    }
}

class Board {
    constructor() {
	// just store card numbers for simplicity
	this.stacks = {"red": [],
		       "green": [],
		       "blue": [],
		       "yellow": [],
		       "white": [] }
	// feels like storing a card list
	// will be good for AI
	this.cards = [];
    }

    attempt_place(card) {
	var stack = this.stacks[card.color];
	var max = Math.max.apply(Math, stack); // yuck
	// max is -Infinity if list is empty
	if (max < 0) {
	    max = 0;
	}
	// place card if stack is not full and if card is
	// the correct number
	if (stack.length < 5 && card.number == max + 1) {
	    stack.push(card.number);
	    this.cards.push(card);
	    return true;
	}
	// otherwise tell player we failed
	return false;
    }

    // return true if we have filled every stack, winning the game
    check_victory() {
	return (this.cards.length == 25);
    }
}

class Game {
    constructor() {
	this.deck = new Deck();
	this.board = new Board();
	this.discard = [];
	this.tokens = 20;
	this.fuse = 3;
	this.players = [];
	this.state = "lobby";
	this.over = false;
    }

    startgame(playerlist) {
	for (let name of playerlist) {
	    this.players.push(new Player(name, this));
	}
	for (let player of this.players) {
	    player.draw_cards(4);
	}
	this.state = "running";
	this.turn = Math.floor((Math.random() * this.players.length));
	
	return this.get_state();
    }

    // set the turn index to that of the next player to go
    change_turn() {
	this.turn = (this.turn + 1) % this.players.length;
    }

    // return name for current turn
    get_turn() {
	return this.players[this.turn].name;
    }

    // return the starting game state
    get_state() {
	return { decksize: this.deck.size(),
		 discard:  this.cardlist_json(this.discard),
		 tokens:   this.tokens,
		 fuse:     this.fuse,
		 turn:     this.get_turn(),
		 board:    this.board_json(),
		 players:  this.players_json() };
    }

    refund_token() {
	if (this.tokens < 20) {
	    this.tokens += 1;
	}
    }

    // JSON cardlist format:
    // [ {"red":"1"}, {"blue":"2"}, {"red":"4"} ] etc
    cardlist_json(cardlist) {
	// return array of cards in nice json form
	var output = [];
	for (var i = 0; i < cardlist.length; i++) {
	    var card = cardlist[i]
	    var card_json = {color: card.color, number: card.number.toString()};
	    //card_json[card.color] = card.number;
	    output.push(card_json);
	}
	return output;
    }

    board_json() {
	return this.cardlist_json(this.board.cards);
    }

    players_json() {
	var output = {};
	for (let player of this.players) {
	    output[player.name] = this.cardlist_json(player.hand);
	}
	return output;
    }

    player_newcards(playername, newlist, old_index) {
	var output = {};
	output.name = playername;
	output.newlist = this.cardlist_json(newlist);
	output.old_index = old_index;
	return output;
    }

    // return true if fuse blows, game over
    fuse_tick() {
	this.fuse--;
	return (this.fuse < 1);
    }

    // Handle a play command from a client
    player_play(name, index) {
	var player = this.find_player(name);
	var new_cards = player.place(index);
	var turn = this.get_turn();
	if (this.over) {
	    turn = "";
	}
	return { decksize: this.deck.size(),
		 discard:  this.cardlist_json(this.discard),
		 newhand:  this.player_newcards(name, new_cards, index),
	         turn:     turn,
	         board:    this.board_json(),
	         fuse:     this.fuse,
	         done:     this.over};
    }

    // handle a discard command from a client
    player_discard(name, index) {
	var player = this.find_player(name);
	let new_cards = player.discard(index);
	var turn = this.get_turn();
	if (this.over) {
	    turn = "";
	}
	return { decksize: this.deck.size(),
		 discard:  this.cardlist_json(this.discard),
		 turn:     turn,
		 tokens:   this.tokens,
		 newhand:  this.player_newcards(name, new_cards, index),
	         done:     this.over};
    }

    player_inform() {
	if (this.tokens < 1) {
	    return {};
	}
	this.tokens--;
	this.change_turn();
	return { tokens: this.tokens,
	         turn:   this.get_turn()};
    }

    find_player(name) {
	for (let player of this.players) {
	    if (player.name == name) {
		return player;
	    }
	}
    }
}

exports.Game = Game;

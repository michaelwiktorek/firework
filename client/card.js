'use strict';

exports = module.exports = {};
var $ = require("jquery");
var card_lib = require("./card.js");

// client-side representation of a card
// should hold a reference to a DOM object
class Card {
    constructor(card, dom, owner, board) {
	this.color = card.color;
	this.number = card.number;
	this.dom = dom;
	this.owner = owner;
	this.board = board;
	this.create_buttons();
    }

    create_buttons() {
	this.color_btn  = $('<button>').text("color");
	this.number_btn = $('<button>').text("number");
	this.back_btn   = $('<button>').text("back");
	this.dom.append(this.color_btn).append(this.number_btn).append(this.back_btn);
	this.dom.children("button").hide();
	this.back_btn_behavior();
	this.data_btns_behavior();
    }

    back_btn_behavior() {
	var self = this;
	this.back_btn.click(function (e) {
	    e.stopPropagation();
	    self.dom.children("button").hide();
	    $(".cancel").prop("disabled", false);
	});
    }

    data_btns_behavior() {
	var self = this;
	this.color_btn.click(function(e){
	    e.stopPropagation();
	    self.send_playercard_data("color");
	});
	this.number_btn.click(function(e){
	    e.stopPropagation();
	    self.send_playercard_data("number");
	});
    }

        // search player hand for cards with same property,
    // then send that data via "inform" event to the server
    send_playercard_data(property) {
	if (this.board.turn == this.board.client.name) {
	    let msg = {action: "inform", name: this.owner.name};
	    msg.data = {property: property, value: this[property]};
	    let indices = [];
	    for (let i = 0; i < this.owner.hand.length; i++) {
		if (this.owner.hand[i][property] == this[property]) {
		    indices.push(i);
		}
	    }
	    msg.data.indices = indices;
	    this.dom.children("button").hide();
	    this.dom.css("border", "1px black solid");
	    $(".in_hand").unbind("mouseover mouseout click");
	    $(".token").text("Spend Token");
	    $(".cancel").remove();
	    this.board.enable_card_controls();
	    $(".token").prop("disabled", false);
	    this.board.socket.emit("action", JSON.stringify(msg));
	}
    }
}

class Hidden_Card {
    constructor(dom, board, index) {
	this.board  = board;
	this.hand   = board.hand;
	this.name   = board.client.name;
	this.socket = board.client.socket;
	this.index  = index;
	
	this.dom = dom;
	this.dom.addClass("hidden_card");
	this.discard_btn = $('<button>').text("discard");
	this.play_btn    = $('<button>').text("play");
	this.dom.append(this.discard_btn).append(this.play_btn);

	// add handlers for "play" and "discard" buttons
	this.init_handlers(this.play_btn, this.discard_btn);
    }

    // set callbacks for handlers
    init_handlers(play, discard) {
	play.click(this.play_card.bind(this));
	discard.click(this.discard.bind(this));
    }

    set_color(color) {
	this.color = color;
	this.render_color();
    }

    set_number(number) {
	this.number = number;
	// remove number span just in case we already knew number
	this.dom.find("span").remove();
	this.render_number();
    }

    render_color() {
	if (this.color != undefined) {
	    this.dom.css("background-color", this.color);
	}
    }

    render_number() {
	if (this.number != undefined) {
	    this.dom.append($('<span>').text(this.number.toString()));
	}
    }

    remove_self() {
	this.hand.splice(this.index, 1); // remove self from hand
	this.dom.remove();  // remove dom element
	var div = $('<div>');
	$("#game_area").append(div);
	this.hand.push(new card_lib.Hidden_Card(div, this.board, 3));
	for (let i = 0; i < this.hand.length; i++) {
	    this.hand[i].set_index(i);
	}
    }

    disable_buttons() {
	this.play_btn.prop("disabled", true);
	this.discard_btn.prop("disabled", true);
    }

    enable_buttons() {
	this.play_btn.prop("disabled", false);
	this.discard_btn.prop("disabled", false);
    }

    set_index(index) {
	this.index = index;
    }

    // TODO play a little animation?
    play_card() {
	if (this.board.turn == this.name) {
	    var action = {name: this.name,
			  id: this.board.client.game_id,
			  action: "play",
			  index: this.index};
	    this.remove_self();
	    this.socket.emit("action", JSON.stringify(action));
	}
    }

    discard() {
	if (this.board.turn == this.name) {
	    var action = {name: this.name,
			  id: this.board.client.game_id,
			  action: "discard",
			  index: this.index};
	    this.remove_self();
	    this.socket.emit("action", JSON.stringify(action));
	}
    }
}

exports.Card = Card;
exports.Hidden_Card = Hidden_Card;

'use strict';

exports = module.exports = {};

// client-side representation of a player in the game
// maintains a hand, with card data
// should hold references directly to DOM elements
class Player {
    constructor(name, hand, dom) {
	this.name = name;
	this.hand = hand;
	this.dom = dom;
    }
}

exports.Player = Player;


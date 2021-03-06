var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var _ = require('lodash');

app.use(express.static('public'));

var urlencodedParser = bodyParser.urlencoded({ extended: false })

app.get('/', function (req, res) {
  res.sendFile( __dirname + "/" + "index.html" );
});

app.post('/', urlencodedParser, function (req, res) {
  console.log("Got a POST request for the homepage");

  if (req.body.text) {
    var item = parseItem(req.body.text, req.body.league);
    res.send(JSON.stringify(item));
  } else {
    var error = { error : "Text not found in request body!" };
    throw(JSON.stringify(error));
  }
})

app.listen(9000, function () {
  console.log('Example app listening on port 9000!');
});


function parseItem(text, league) {
  var item = new Object();
  item.info = new Object(); 
  item.attributes = new Object(); 
  item.attributes.league = league;

  // Note, we need to remove this after we've written mod parsing subroutines
  item.debug = new Object;

  // Remove unnecessary \r\n nonsense so we can filter by newlines properly
  text = text.replace(/\r\n/g, "\n")

  // Split the item text into an array based on the default separator
  // NOTE: Different items will have different numbers of slices and
  // the slice where specific information sits will change, however
  // the first slice always appears to contain rarity and name
  // (also note we remove any empty values just in case)
  var infoArray = _.compact(text.split(/\n--------\n/));

  // The infoArray must be a minimum of 4 elements - at time of
  // writing I'm not aware of any item which has less than 4 elements
  if (infoArray.length < 4) {
    var error = { error : "Valid item data should have at least four elements separated by dashes!" };
    throw(JSON.stringify(error));
  }


  // Split the first slice by newlines while removing empty values
  var nameArray = _.compact(infoArray[0].split(/\n/));

  // The name array must have two elements or it is incomplete
  if (nameArray.length < 2) {
    var error = { error : "First slice of clipboard data is too small - missing either name or rarity!" };
    throw(JSON.stringify(error));
  }

  // Check the first line of the first slice for the Item Rarity
  if (nameArray[0].match(/Rarity:/)) {
    var itemRarity = nameArray[0].match(/Rarity: (.*)/);
    item.attributes.rarity = itemRarity[1];
  } else {
    var error = { error : "Could not determine item rarity from line 1 of item text. Text must start with Rarity:" };
    throw(JSON.stringify(error)); 
  }

  // Populate the item name based on the second and optional third line of the first slice
  if (nameArray[2]) {
    item.info.fullName = nameArray[1] + " " + nameArray[2];
  } else {
    item.info.fullName = nameArray[1];
  }

  // Here's where things get tricky. Different item types have different data in the second slice.
  // Weapons: type, quality, damage, APS, critical strike
  // Armour: quality, armour/evasion/ES ratings
  // Maps: Map Tier, Quantity, Rarity
  // Currency: Stack Size
  // Gems: Gem information
  // Divination Card: Stack Size
  // Prophecy: flavour text
  // normal items: item level
  // jewelry with requirements: requirements
  //
  // To do analysis, we need to look at some other data to optimize things.
  // rarity: Gem or Currency tell us what to look for in this slice
  // if the item has rarity:Normal and a Stack Size in this slice, it's a Div Card
  // blah blah
  //
  // Instead of just looking at the second slice, let's start by finding ANY
  // slice that starts with various things we know. 

  // OY OY OY ADD UNIDENTIFIED ITEM SUPPORT PEW PEW

  // PROPHECY:
  // If an item is normal and has the text "Right-click to add this prophecy to your character"
  // then it is a prophecy.
  if (item.attributes.rarity == "Normal" && infoArray.indexOf("Right-click to add this prophecy to your character.") > -1) {
    item.attributes.baseItemType = "Prophecy";
    return(item);

  // DIVINATION CARD:
  // If an item is normal and has a Stack Size, then it should be a Divination Card
  } else if (item.attributes.rarity == "Normal" && infoArray[1].match(/Stack Size:/)) {
    item.attributes.baseItemType = "Card";
    return(item);

  // MAPS:
  // if infoArray[1] contains "Map Tier:" then it's a map
  } else if (infoArray[1].match(/Map Tier:/)) {
    item.attributes.baseItemType = "Map";
    item.properties = new Object();
    item.properties.Map = new Object();
    // Extract the map properties from infoArray[1] by iterating on them
    // and converting them to numbers since they will always be properties.Map.[prop] = ###
    var thisInfo = _.compact(infoArray[1].split(/\n/));
    thisInfo.forEach(function (element) {
      thisProperty = element.split(": ");
      item.properties.Map[thisProperty[0]] = Number(thisProperty[1].replace(/\D+/g, ''));
    });

    // for maps, infoArray[2] should always be the Item Level
    if (infoArray[2].match(/Item Level:/)) {
      thisProperty = infoArray[2].split(": ");
      item.attributes.ilvl = Number(thisProperty[1]);
    }

    // next for maps, infoArray[3] will contain mods if the item isn't normal, and maps don't
    // have implicit mods - OR DO THEY?!?!?!
    if (item.attributes.rarity != "Normal") {
      item.mods = new Object;
      item.mods.Map = new Object;
      item.mods.Map.explicit = new Object;
      var thisInfo = _.compact(infoArray[3].split(/\n/));
      thisInfo.forEach(function (element) {
        var decodedMods = parseMod(element);
        item.mods.Map.explicit[decodedMods[0]] = decodedMods[1];
      });
    }

    return(item);

  // Map / Vaal Fragments
  // If the item is Normal rarity and says "Can be used in the Eternal Laboratory or a personal Map Device."
  // it is probably a map fragment or vaal fragment
  } else if (item.attributes.rarity == "Normal" && infoArray.indexOf("Can be used in the Eternal Laboratory or a personal Map Device.")) {
    // If it has "Sacrifice at" or "Mortal" in the name then it's a vaal fragment, else a map fragment
    if (item.info.fullName.match(/^Sacrifice at/) || item.info.fullName.match(/^Mortal /)) {
      item.attributes.baseItemType = "Vaal Fragment";
    } else {
      item.attributes.baseItemType = "Map Fragment";
    }
    return(item);
  }


  // Find an element with "Requirements:" if it exists
  // console.log(_.indexOf(infoArray, "Requirements:"));




  item.warning = "This item wasn't fully identified and is returning only default info!";
  return item;


}

function parseMod(mod) {
  // This subroutine performs basic mod parsing. Right now it is not
  // nearly as complex as the ExileTools Indexer mod parsing.
  // At some point it will need to have modsTotal / etc. calculated

  // this can be better, I'm not good at nested matches in javascript, way easier
  // in perl - I'm probably missing something, but it works for now
  var matches = mod.match(/^(.*) (\d+)%(.*)/);
  if (matches != null) {
    var modName = matches[1] + " #%" + matches[3];
    var modValue = Number(matches[2]);
    console.log(modName + " : " + modValue);
  } else {
    var matches = mod.match(/^(.*) (\d+) (.*)/);
    if (matches != null) {
      var modName = matches[1] + " # " + matches[3];
      var modValue = Number(matches[2]);
      console.log(modName + " : " + modValue);
    } else {
      var modName = mod;
      var modValue = 'true';
    }

  }



  return[modName, modValue];
}

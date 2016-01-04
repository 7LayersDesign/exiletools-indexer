// We define an EsConnector module that depends on the elasticsearch module.     
var EsConnector = angular.module('EsConnector', ['elasticsearch','ui.bootstrap','ui.grid','ui.grid.autoResize']);

// Create the es service from the esFactory
EsConnector.service('es', function (esFactory) {
  return esFactory({ host: 'http://apikey:DEVELOPMENT-Indexer@api.exiletools.com' });
});

// We define an Angular controller that returns the server health
// Inputs: $scope and the 'es' service

EsConnector.controller('ServerHealthController', function($scope, es) {
    es.cluster.health(function (err, resp) {
        if (err) {
            $scope.data = err.message;
        } else {
            $scope.data = resp;
        }
    });
});

// We define an Angular controller that returns query results,
// Inputs: $scope and the 'es' service

EsConnector.controller('GeneralLeagueStats', function($scope, es) {

  // search for documents
  es.search({
// something makes it go index/item/item if we do this?
// type: 'item',
  index: 'index',
  body: {
    "aggs": {
      "ItemsInLeagues": {
        "terms": {
          "field": "attributes.league", 
          "min_doc_count": 1000
        },
        "aggs": {
          "VerifiedStatus": {
            "terms": {
              "field": "shop.verified"
            }
          }
        }
      },
      "RecentItemsInLeagues": {
        "filter": {
          "range": {
            "shop.updated": {
              "gte": "now-3d/d"
            }
          }
        },
        "aggs": {
          "Leagues": {
            "terms": {
              "field": "attributes.league",
              "min_doc_count": 1000
            },
            "aggs": {
              "VerifiedStatus": {
                "terms": {
                  "field": "shop.verified"
                }
              }
            }
          }
        }
      }
    },
    size:0
  }

  }).then(function (response) {

    // see https://github.com/trackpete/exiletools-reporting/issues/4 for more thoughts/info
  
    // Create an information Array
    GeneralStats = new Array();
  
    // Loop through all the ItemsInLeagues buckets
    response.aggregations.ItemsInLeagues.buckets.forEach(function (item, index, array) {
      // Create a local Object to shove all this data into
      DataObject = new Object();
      // Add the total count information and league name
      DataObject.LeagueName = item.key;
      DataObject.TotalItems = item.doc_count;
   
      // Iterate through the buckets to find some stats to add 
      item.VerifiedStatus.buckets.forEach(function (stats, index, array) {
        // Rename the stats key to verified - why is grid ui adding spaces?
        stats.key = 'Verified: ' + stats.key;
        // Add this count to the Object
        DataObject[stats.key] = stats.doc_count;
      });
      // Push this Object onto the GeneralStats Array
      GeneralStats.push(DataObject);
    });

    // Repeat this process for the Recent stats
    // Create an information Array
    RecentGeneralStats = new Array();

    // console.log(response.aggregations.RecentItemsInLeagues.Leagues.buckets);

    // Loop through all the ItemsInLeagues.Leagues buckets (since Leagues is a sub aggregation)
    response.aggregations.RecentItemsInLeagues.Leagues.buckets.forEach(function (item, index, array) {
      // Create a local Object to shove all this data into
      DataObject = new Object();
      // Add the total count information and league name
      DataObject.LeagueName = item.key;
      DataObject.TotalItems = item.doc_count;

      // Iterate through the buckets to find some stats to add 
      item.VerifiedStatus.buckets.forEach(function (stats, index, array) {
        // Rename the stats key to verified - why is grid ui adding spaces?
        stats.key = 'Verified: ' + stats.key;
        // Add this count to the Object
        DataObject[stats.key] = stats.doc_count;
      });
      // Push this Object onto the GeneralStats Array
      RecentGeneralStats.push(DataObject);
    });

    // Set these into the scope object so angular can see them  
    $scope.GeneralStats = GeneralStats;
    $scope.RecentGeneralStats = RecentGeneralStats;

  }, function (err) {
    console.trace(err.message);
  });

});

EsConnector.controller('RunStatsHisto1', function($scope, es) {
  // search for documents
  es.search({
  type: 'run',
  index: 'stats',
  body: {
    "aggs": {
      "Histogram": {
        "date_histogram": {
          "field": "RunTimestamp",
          "interval": "day"
        },
        "aggs" : {
          "PagesFetched" : {
            "sum": {
              "field": "ShopPagesFetched"
            }
          },
          "UpdatedThreads" : {
            "sum": {
              "field": "UpdatedThreads"
            }
          },
          "NewThreads" : {
            "sum": {
              "field": "NewThreads"
            }
          },
          "TransferKB" : {
            "sum": {
              "field": "TotalTransferKB"
            }
          }
        }
      }
    },
    size:0
  }

  }).then(function (response) {
    // I don't know if there's a better way to do this, but looping through the results should be
    // faster than making four separate Aggregation requests
    var HistoData1 = new Array();
    var HistoData2 = new Array();
    var HistoData3 = new Array();
    var HistoData4 = new Array();

    // I don't know if variables have to be declared like this in javascript so I'm erring on the side of caution
    var TotalMB = 0;
    var TotalRefreshedPages = 0;
    var TotalNewThreads = 0;
    var TotalUpdatedThreads = 0;

    response.aggregations.Histogram.buckets.forEach(function (time, index, array) {
      // Loop through the histogram buckets and create Arrays for each day
      var MyRow = new Array();
      MyRow[0] = time.key;
      MyRow[1] = time.TransferKB.value / 1024;
      HistoData1.push(MyRow);

      var MyRow = new Array();
      MyRow[0] = time.key;
      MyRow[1] = time.PagesFetched.value;
      HistoData2.push(MyRow);

      var MyRow = new Array();
      MyRow[0] = time.key;
      MyRow[1] = time.NewThreads.value;
      HistoData3.push(MyRow);

      var MyRow = new Array();
      MyRow[0] = time.key;
      MyRow[1] = time.UpdatedThreads.value;
      HistoData4.push(MyRow);

      TotalMB += (time.TransferKB.value / 1024);
      TotalRefreshedPages += time.PagesFetched.value;
      TotalNewThreads += time.NewThreads.value;
      TotalUpdatedThreads += time.UpdatedThreads.value;
    });
  
    // Set these in scope for angular
    $scope.TotalMB = TotalMB;
    $scope.TotalRefreshedPages = TotalRefreshedPages;
    $scope.NewThreads = TotalNewThreads;
    $scope.UpdatedThreads = TotalUpdatedThreads;

    // Get the date of the first day
    var FirstDay = new Date(response.aggregations.Histogram.buckets[0].key);
    $scope.FirstDay = FirstDay;

    // Force use of the comma separator for numbers, highcharts seems to default to spaces, bleh
    Highcharts.setOptions({
      lang: {
        thousandsSep: ','
      }
    });

    // Create GrapthTotalTransferMB using HistoData1
    $('#GraphTotalTransferMB').highcharts('StockChart', {
      rangeSelector : {
        allButtonsEnabled: true,
        buttons: [{
          type: 'day',
          count: 1,
          text: '1d'
        },{
          type: 'week',
          count: 1,
          text: '1w'
        },{
          type: 'month',
          count: 1,
          text: '1m'
        }],
        selected : 1
      },
      title : {
        text : 'Compressed MegaBytes of Forum Data Downloaded Daily'
      },
      colors: ['#cc0000'],
      series : [{
        name : 'TotalTransferMB',
        data : HistoData1,
        type : 'area',
        fillColor : {
          linearGradient : {
            x1: 0,
            y1: 0,
            x2: 0,
            y2: 1
          },
          stops : [
            [0, '#cc0000'],
            [1, Highcharts.Color('#cc0000').setOpacity(0).get('rgba')]
          ]
        }
      }]
    });
    // Create GraphShopPagesFetched using HistoData2
    $('#GraphShopPagesFetched').highcharts('StockChart', {
      rangeSelector : {
        allButtonsEnabled: true,
        buttons: [{
          type: 'day',
          count: 1,
          text: '1d'
        },{
          type: 'week',
          count: 1,
          text: '1w'
        },{
          type: 'month',
          count: 1,
          text: '1m'
        }],
        selected : 1
      },
      colors: ['#ffcc66','#66ff66','#00cc99'],
      title : {
        text : 'Total Shop Pages Fetched/Refreshed, Updated via Bumps, and New Shops Found'
      },

      series : [{
        name : 'Shop Pages Fetched',
        data : HistoData2,
        type : 'area',
        fillColor : {
          linearGradient : {
            x1: 0,
            y1: 0,
            x2: 0,
            y2: 1
          },
          stops : [
            [0, '#ffcc66'],
            [1, Highcharts.Color('#ffcc66').setOpacity(0).get('rgba')]
          ]
        }
      },{
        name : 'New Shops Found In Forum Indexes',
        data : HistoData3
      },{
        name : 'Updated Shops Loaded via Bumped Thread',
        data : HistoData4
      }]
    });
  }, function (err) {
    console.trace(err.message);
  });

});


EsConnector.controller('ThreadHeadlineStats', function($scope, es) {
  // search for documents
  es.search({
  type: 'thread',
  index: 'stats',
  body: {
    "aggs": {
      "threadcount": {
        "cardinality": {
          "field": "threadid"
        }
      },
      "sellercount": {
        "cardinality": {
          "field": "sellerAccount"
        }    
      },
      "itemsAdded" : {
        "sum": {
          "field": "itemsAdded"
        } 
      },
      "itemsRemoved" : {
        "sum": {
          "field": "itemsRemoved"
        } 
      },  
      "itemsModified" : {
        "sum": {
          "field": "itemsModified"
        } 
      },
      "itemsProcessed" : {
        "sum": {
          "field": "totalItems"
        } 
      },
      "generatedWith" : {
        "terms": {
          "field": "generatedWith",
          "size": 10
        }
      }
    },
    "sort": [
      {
        "updateTimestamp": {
           "order": "asc"
        }
      }
    ], 
    size:1
  }

  }).then(function (response) {

    $scope.TotalThreadsProcessed = response.hits.total;
    $scope.UniqueShopCount = response.aggregations.threadcount.value;
    $scope.UniqueSellerCount = response.aggregations.sellercount.value;
    $scope.TotalItemsAdded = response.aggregations.itemsAdded.value;
    $scope.TotalItemsRemoved = response.aggregations.itemsRemoved.value;
    $scope.TotalItemsModified = response.aggregations.itemsModified.value;
    $scope.TotalItemsProcessed = response.aggregations.itemsProcessed.value;
 
    var FirstThread = new Date(response.hits.hits[0]._source.updateTimestamp * 1000);
    $scope.FirstThread = FirstThread;
   
    var generatedWith = new Object();
    response.aggregations.generatedWith.buckets.forEach(function (val, index, array) {
      generatedWith[val.key] = val.doc_count;
    });
    $scope.generatedWith = generatedWith;

  }, function (err) {
    console.trace(err.message);
  });

});

var express = require('express'),
    //routes = require('./routes'),
    http = require('http'),
    path = require('path'),
    xml2js = require('xml2js'),
    moment = require('moment'),
    redis,
    Cache,
    YR;

var app = express();

app.configure(function(){
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(require('less-middleware')({ src: __dirname + '/public' }));
  app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function(){
  app.use(express.errorHandler());
});


//
// Routes and handlers
//
// Home page
app.get('/', function(req, res){
  res.render('index');
});

// Create widget
app.post('/', function(req, res){
  res.send('creating');
});

// Show forecast data in JSONP format
app.get('/api/forecast', function(req, res) {
    if(!req.query.jsonp) {
      return res.send(400, "Missig jsonp. Example: ?jsonp=myCallback");
    }
    return handleShowForecast(req, res, req.query.jsonp);
});

// Show forecast as plain HTML
app.get('/forecast', function(req, res) {
  return handleShowForecast(req, res);
});

// Generic handler of forecast that
// outputs HTML or widget
function handleShowForecast(req, res, jsonp) {
  var weatherUrl = req.query.url,
      limit = req.query.limit || 10;

  if(!weatherUrl) {
    return res.send(400, "Missing url to forecast xml. Example: ?url=http://www.yr.no/place/Norway/Telemark/Sauherad/Gvarv/forecast.xml");
  }

  weatherUrl = weatherUrl.replace('http://', '');

  Cache.getOrFetch(weatherUrl, function(err, forecast, fromCache) {
    if(err) {
      res.send(err);
    }
    res.setHeader("X-Polman-Cache-Hit", fromCache || false);
    res.setHeader("Content-Type", jsonp ? "application/javascript" : "text/html");

    res.render(jsonp ? 'forecast-jsonp' : 'forecast', {forecast: forecast, num: limit, moment: moment, jsonp: jsonp});
  });
}


//
// YR client for fetching and parsing data from
// yr.no's web service.
//
YR = {

  initialize: function() {
    this.parser = new xml2js.Parser({ mergeAttrs: true, explicitArray: false });
  },

  // Fetch weather data from given url
  fetch: function(url, cb) {
    var that = this;

    http.get({
      host: 'www.yr.no',
      path: url.slice(url.indexOf('/'), url.length)
    }, onResponse).end();

    function onResponse(res) {
      var body = '';

      res.on('data', function (chunk) {
        body += chunk;
      });
    
      res.on('end', function () {
        that.xmlToJson(body, function(err, json) {
          if(err || json['error']) {
            cb.call(this, "Error: Could not parse XML from yr.no");
            return;
          }
          json = that.tidyJSON(json);
          Cache.set(url, JSON.stringify(json));
          cb.call(this, undefined, json);
        });
      });

      res.on('error', function () {
        cb.call(this, "Could not fetch data from yr.no");
      });
    }
  },

  // Parse XML from yr.no into JSON format
  // that can be used when rendering the view.
  xmlToJson: function(xml, cb) {
    // TODO
    this.parser.parseString(xml, cb);
  },

  // Tidy JSON object that was automagically
  // created from XML
  tidyJSON: function(json) {
    json.weatherdata.forecast.tabular = json.weatherdata.forecast.tabular.time;
    if(json.weatherdata.forecast.text) {
      delete json.weatherdata.forecast.text;
    }
    return json;
  }

};


//
// Redis cache.
//
Cache = {
  
  // Cache TTL/expiry in seconds
  ttl: 60*15,

  initialize: function() {
    if (process.env.REDISTOGO_URL) {
      var rtg = require("url").parse(process.env.REDISTOGO_URL);
      redis = require("redis").createClient(rtg.port, rtg.hostname);
      redis.auth(rtg.auth.split(":")[1]);
    } else {
      redis = require("redis").createClient();
    }
  },

  getOrFetch: function(key, cb) {
    redis.get(key, function(err, forecast) {
      if(forecast) {
        // Hit from cache
        cb.call(this, undefined, JSON.parse(forecast), true);
      } else {
        // Go ask yr.no about the forecast
        YR.fetch(key, cb);
      }
    });
  },

  set: function(key, value) {
    var that = this;
    redis.set(key, value, function() {
      redis.expire(key, that.ttl);
    });
  }

};


//
// Create and start server :)
//
http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
  Cache.initialize();
  YR.initialize();
});


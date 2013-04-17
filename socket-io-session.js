(function(){
  var parseCookie, parseSignedCookie, parseJSONCookie;
  parseCookie = require('express/node_modules/cookie').parse;
  parseSignedCookie = require('express/node_modules/connect').utils.parseSignedCookie;
  parseJSONCookie = require('express/node_modules/connect').utils.parseJSONCookie;
  exports.cookieSession = function(secret){
    return function(data, accept){
      var rawCookie, unsignedCookie;
      data.session = {};
      if (data.headers.cookie) {
        rawCookie = parseCookie(data.headers.cookie)['connect.sess'];
        if (rawCookie) {
          unsignedCookie = parseSignedCookie(rawCookie, secret);
          if (unsignedCookie) {
            data.session = parseJSONCookie(unsignedCookie);
            if (!data.session.auth) {
              return accept('Not login.', false);
            }
          }
        }
      } else {
        return accept('No cookie transmitted.', false);
      }
      return accept(null, true);
    };
  };
}).call(this);

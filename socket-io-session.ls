parseCookie = require 'express/node_modules/cookie' .parse
parseSignedCookie = require 'express/node_modules/connect' .utils.parseSignedCookie
parseJSONCookie = require 'express/node_modules/connect' .utils.parseJSONCookie

exports.cookieSession = (secret) ->
  (data, accept) ->
    data.session = {}
    if data.headers.cookie
      rawCookie = parseCookie(data.headers.cookie)['connect.sess']
      if rawCookie
        unsignedCookie = parseSignedCookie rawCookie, secret
        if unsignedCookie
          data.session = parseJSONCookie unsignedCookie
          if !data.session.auth
            return accept 'Not login.', false
    else
      return accept 'No cookie transmitted.', false
    accept null, true


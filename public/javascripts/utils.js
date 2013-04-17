if(!Date.now){   
    Date.now = function(){   
        return new Date().valueOf();   
    }   
}

$.fn.setCursorPosition = function(position){
    if(this.lengh == 0) return this;
    return $(this).setSelection(position, position);
}

$.fn.setSelection = function(selectionStart, selectionEnd) {
    if(this.lengh == 0) return this;
    input = this[0];

    if (input.createTextRange) {
        var range = input.createTextRange();
        range.collapse(true);
        range.moveEnd('character', selectionEnd);
        range.moveStart('character', selectionStart);
        range.select();
    } else if (input.setSelectionRange) {
        input.focus();
        input.setSelectionRange(selectionStart, selectionEnd);
    }

    return this;
}

$.fn.focusEnd = function(){
    this.setCursorPosition(this.val().length);
}

function dateToString(d, showDates){
  d = new Date(d)
  function pad(n){return n<10 ? '0'+n : n}
  if (showDates)
    return pad(d.getMonth()+1)+'-'
        + pad(d.getDate())+' '
        + pad(d.getHours())+':'
        + pad(d.getMinutes()) + ':'
        + pad(d.getSeconds())
  else
    return pad(d.getHours())+':'
        + pad(d.getMinutes()) + ':'
        + pad(d.getSeconds())
}

var logTemplate = _.template('<p><span style="color: #aaa;"><%= d %></span>&nbsp;<span style="color: <%= c %>;"><%= m %></span></p>')

$.fn.appendLog = function(log, current, channel, showDates) {
  if (log.length < 4) return this
  var d = dateToString(log[0], showDates), u = log[1], t = log[2], m = _(log[3]).escape()
  if (t !== '#' && t !== current && u !== current) return this
  var c = u in channel.member ? channel.member[u].color : '#000000'
  this.append(logTemplate({d:d, c:c, m:m}))
  window.scrollTo(0, 999999)
  return this
}


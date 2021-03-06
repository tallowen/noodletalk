$(function() {
  var socket = io.connect(document.location);
  var messagesUnread = 0;
  var currentNickname = null;
  var userList = [];
  var userCount = 0;
  var logLimit = 80;
  var myPost = false;
  var mediaColumn = $('#media ol');
  var mediaIframeMatcher = /<iframe\s.+><\/iframe>/i;
  var mediaVideoMatcher = /<video\s.+>.+<\/video>/i;
  var mediaAudioMatcher = /<audio\s.+>.+<\/audio>/i;
  var isSubmitting = false;
  var localVersion = undefined;
  var hushLock = 0;

  var updateMedia = function(data) {
    // Update the media
    var message = $.trim(data.message);
    if(mediaIframeMatcher.exec(message) !== null ||
      mediaVideoMatcher.exec(message) !== null ||
      mediaAudioMatcher.exec(message) !== null) {
      var mediaItem = $('<li class="font' + data.font + '"></li>');

      mediaColumn.prepend(mediaItem.html(message));
      if(mediaColumn.find('li').length > 3) {
        mediaColumn.find('li:last-child').remove();
      }
    }
  };
  
  var hush = function(content,contentID,timeToFadeIn,timeToAppear) {
    if (!hushLock)
    {
      hushLock = 1;
      
      // Disable messaging.
      $('input[name=message]').attr('disabled','disabled');
      
      // Disable scrolling.
      disableScroll();
      
      setTimeout(function() {
        setTimeout(function()
        {
          var newElement = jQuery(content);
          newElement.attr('id', contentID);
          newElement.attr('class', 'hush');
          $('body').append(newElement);
          $('#'+contentID).animate({'width':440,'height':338, 'margin-left': -220, 'margin-top': -184}, timeToAppear, function() {});
        },timeToAppear);
        $('#hush').fadeIn();
      },timeToFadeIn);
    }
  }
  
  var unHush = function(contentID,timeToFadeOut,timeToDisappear) {
    setTimeout(function() {
      setTimeout(function()
      {
        $('#hush').fadeOut();
        hushLock = 0;
      },timeToFadeOut);
      $('#'+contentID).animate({'width':0,'height':0, 'margin-left': 0, 'margin-top': 0}, timeToDisappear, function() {});
    },timeToDisappear);
  }
  
  var updateMessage = function(data) {
    // Update the message
    var message = $.trim(data.message);

    if (message.length > 0 && $('ol li[data-created="' + data.created + '"]').length === 0) {
      if(currentNickname !== data.nickname){
        currentNickname = data.nickname;
      }

      if (data.is_action) {
        var msg = $('<li class="action font' + data.font + '" data-created="' + data.created +
                    '"><p></p><a href="#" class="delete">x</a></li>');
        msg.find('p').html(message);

        // if this is a nick change, set the nick in the dom for the user
        if (data.action_type === 'nick' && myPost) {
          $('body').data('nick', data.nickname.replace(/\s/, ''));
          myPost = false;
        }

      } else {
        var highlight = '';
        var nickReference = data.message.split(': ')[0];

        if (nickReference) {
          nickReference = nickReference.replace(/\s/, '');
          if (nickReference === $('body').data('nick') && !myPost) {
            highlight = 'nick-highlight';
          }
        }

        var msg = $('<li class="font' + data.font + ' ' + highlight +
                    '" data-created="' + data.created +
                    '"><img><span class="nick">' + data.nickname + '</span><time>' +
                    getMessageDateTimeString(data) + '</time><p></p>' +
                    '<a href="#" class="delete">x</a></li>');
        msg.find('img').attr('src', data.gravatar);
        msg.find('p').html(message);
        myPost = false;
      }

      // Apply log limiter
      $('body ol li:nth-child(n+' + logLimit +')').remove();

      // Add new message
      $('body #messages ol').prepend(msg);
    }
    
    messagesUnread += 1;
    document.title = 'Noodle Talk (' + messagesUnread + ')';
    
    // Version checking: if we have a mismatch of our local version and the server version force a refresh.
    if (data.version)
    {
      if (localVersion === undefined)
      {
        localVersion = data.version;
      } else if (localVersion != data.version) {
        hush('<img onclick="window.location.reload()" src="/images/please_refresh.gif" />', 'refresh', 500, 1000);
        console.log('refreshing: ' + localVersion + ' != ' + data.version);
      }
    }
  };

  // if the user just landed on this page, get the recent messages
  $.get('/recent', function(data) {
    var messages = data.messages;
    for (var i=0; i < messages.generic.length; i++) {
      updateMessage(messages.generic[i]);
    }
    for (var i=0; i < messages.media.length; i++) {
      updateMedia(messages.media[i]);
    }
    
    // Update the user list
    userList = data.user_list;
    
    // Update the user count
    // jcw: Adding one in this call only because we haven't counted our own connection yet.
    userCount = parseInt(data.connected_clients, 10)+1;
    $('#info .connected span').text(userCount);
    
    // Keep list sane, compile tab completion, etc.
    keepListSane();
  });

  $('#login').click(function() {
    navigator.id.getVerifiedEmail(function(assertion) {
      if (assertion) {
        var loginForm = $('#login-form');

        loginForm.find('input').val(assertion);
        $.post('/login', loginForm.serialize(), function(data) {
          document.location.href = '/';
        });
      }
    });
  });

  $('form input').focus(function() {
    document.title = 'Noodle Talk';
    messagesUnread = 0;
  });

  $('#help').click(function() {
    $(this).fadeOut();
  });

  $('form').submit(function(ev) {
    ev.preventDefault();
    var self = $(this);
    
    var helpMatcher = /^(\/help)/i;
    var clearMatcher = /^(\/clear)/i;

    // if this is a help trigger, open up the help window
    if (self.find('input').val().match(helpMatcher)) {
      $('#help').fadeIn();
      self.find('input').val('');
    // if this is a clear trigger, clear all messages
    } else if (self.find('input').val().match(clearMatcher)) {
      $('ol li').remove();
      self.find('input').val('');

    // this is a submission
    } else {
      if (!isSubmitting) {
        isSubmitting = true;
        $('#help').fadeOut();
        myPost = true;
        $.ajax({
          type: 'POST',
          url: self.attr('action'),
          data: self.serialize(),
          success: function(data) {
            $('form input').val('');
            document.title = 'Noodle Talk';
            messagesUnread = 0;
            isSubmitting = false;
          },
          dataType: 'json'
        });
      }
    }
  });

  $('ol').on('click', 'li a.delete', function(ev) {
    ev.preventDefault();
    $(this).closest('li').remove();
  });

  socket.on('connect', function () {
    socket.on('userlist', function (data) {
      userList = data;
      keepListSane();
    });
    socket.on('usercount', function (data) {
      userCount = data;
      $('#info .connected span').text(userCount);
      keepListSane();
    });
    socket.on('message', function (data) {
      updateMessage(data);
      updateMedia(data);
    });
  });
  
  var keepListSane = function() {
    if (userList.length > userCount) {
      userList.splice(userCount, userList.length - userCount);
    }
    socket.tabComplete = new TabComplete(userList);
  };
  
  var showUsers = function() {
    if ($('#userList').css('display') === 'none') {
      if (userList instanceof Array) {
        $('#noodlers').text('');
        userList.forEach(function(user) {
            $('#noodlers').append('<li>' + user + '</li>');
        });
        if (userList.length < userCount) {
          $('#noodlers').append('<li>' + (userCount-userList.length) + ' Anonymous</li>');
        }
      }
      $('#userList').fadeIn();
    }
  };
  var hideUsers = function() {
    if ($('#userList').css('display') !== 'none') {
      $('#userList').fadeOut();
    }
    return false;
  }
  
  $('.connected').click(showUsers);
  $('.connected').mouseout(hideUsers);
  if (navigator.userAgent.match(/iPad|iPhone/)) {
    document.addEventListener('touchstart', hideUsers, false);
  }
  
  // Always Be Typing.
  $('input[name=message]').focus();
  $(document).keypress(function() { $('input[name=message]').focus(); });
});

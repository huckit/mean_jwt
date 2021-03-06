// server.js

// set up ========================
var express = require('express');
var app = express(); // create our app w/ express
var server = require('http').createServer(app);
var io = require('socket.io')(server);

var cors = require('cors')
var mongoose = require('mongoose'); // mongoose for mongodb
var autoIncrement = require('mongoose-auto-increment');
var async = require("async");

var morgan = require('morgan'); // log requests to the console (express4)
var bodyParser = require('body-parser'); // pull information from HTML POST (express4)
var methodOverride = require('method-override'); // simulate DELETE and PUT (express4)
var jwt = require('jsonwebtoken');
var config = require('./config');
var User = require('./app/models/user');
var Invite = require('./app/models/invites');
var Event = require('./app/models/events');
var Player = require('./app/models/players');
var Comments = require('./app/models/comments');
var crypto = require('crypto');
var client = require('twilio')(config.twilio_sid, config.twilio_token);


var nodemailer = require('nodemailer');
var transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: config.username,
        pass: config.password
    }
});

function randomValueHex(len) {
    return crypto.randomBytes(Math.ceil(len / 2))
        .toString('hex') // convert to hexadecimal format
        .slice(0, len); // return required number of characters
}


var apiRoutes = express.Router();

// configuration =================
app.set('superSecret', config.secret);

io.on('connection', function(client) {

    client.on('join', function(data) {
        console.log(data);
        client.emit('messages', 'Hello from server');
    });

});


mongoose.connect('mongodb://localhost:27017/test'); // connect to mongoDB database on modulus.io

app.use(express.static(__dirname + '/public')); // set the static files location /public/img will be /img for users
app.use(morgan('dev')); // log every request to the console
app.use(bodyParser.urlencoded({
    'extended': 'true'
})); // parse application/x-www-form-urlencoded
app.use(bodyParser.json()); // parse application/json
app.use(bodyParser.json({
    type: 'application/vnd.api+json'
})); // parse application/vnd.api+json as json
app.use(methodOverride());
app.use(cors())
var Schema = mongoose.Schema,
    ObjectId = Schema.ObjectID;


apiRoutes.use(function(req, res, next) {

    var token = req.body.token || req.query.token || req.headers['x-access-token'];

    if (token !== "null") {
        jwt.verify(token, app.get('superSecret'), function(err, decoded) {
            if (err) {
                return res.json({
                    success: false,
                    message: 'Failed to authenticate token.'
                });
            } else {
                // if everything is good, save to request for use in other routes
                req.decoded = decoded;
                next();
            }
        });

    } else {

        // if there is no token
        // return an error
        return res.status(403).send({
            success: false,
            message: 'No token provided.'
        });

    }
});

apiRoutes.get('/usersget', function(req, res) {
    User.find({}, function(err, users) {
        res.json(users);
    });
});

app.get('/setup', function(req, res) {

    // create a sample user
    var nick = new User({
        username: 'slatterytom@gmail.com',
        password: '77jump'
    });

    // save the sample user
    nick.save(function(err) {
        if (err)
            throw err;

        res.json({
            success: true
        });
    });
});

app.post('/register', function(req, res) {
    // find the user
    User.findOne({
        username: req.body.name
    }, function(err, user) {

        if (err)
            throw err;

        if (!user) {
            var newuser = new User({
                username: req.body.name,
                password: req.body.password
            });

            // save the sample user
            newuser.save(function(err) {
                if (err)
                    throw err;

                res.json({
                    success: true
                });
            });


        } else if (user) {
            res.json({
                success: false,
                message: 'User already exists.'
            });

        }

    });
});

app.post('/authenticate', function(req, res) {

    // find the user
    User.findOne({
        username: req.body.name
    }, function(err, user) {

        if (err)
            throw err;

        if (!user) {
            res.json({
                success: false,
                message: 'Authentication failed. User not found.'
            });
        } else if (user) {

            // check if password matches
            if (user.password != req.body.password) {
                res.json({
                    success: false,
                    message: 'Authentication failed. Wrong password.'
                });
            } else {

                // if user is found and password is right
                // create a token
                var token = jwt.sign(user, app.get('superSecret'), {
                    expiresInMinutes: 1440 // expires in 24 hours
                });


                // return the information including token as JSON
                res.json({
                    success: true,
                    message: 'Enjoy your token!',
                    user_displayname: user.displayname,
                    token: token
                });
            }

        }

    });
});

app.post('/adduserevent2/:event_id/:ustatus/:invite_code', function(req, res) {
    var new_user_id
    console.log(req.body)
    Player.findOne({
        event_id: req.params.event_id,
        invite_code: req.params.invite_code
    }, function(error, players) {
        if (error)
            res.json(error);
        if (players == null) {
            Invite.findOne({
                    invite_code: req.params.invite_code
                },
                function(err, invites) {
                    if (err)
                        res.send(err)

                    update_invite_status_displayname(invites["_id"], req.params.ustatus, req.body.displayname, req.body.username);

                    Player.create({
                            event_id: req.params.event_id,
                            invite_code: req.params.invite_code,
                            notice_rsvp: req.body.rsvp,
                            //         user_id: usernew._id,
                            notice_comments: req.body.comment_alert,
                            username: req.body.username,
                            displayname: req.body.displayname,
                            in_or_out: req.params.ustatus
                        },
                        function(err, result) {
                            if (err)
                                throw err;
                        });
                    if (req.body.comment != "undefined") {
                        Comments.create({
                                event_id: req.params.event_id,
                                displayname: req.body.displayname,
                                text: req.body.comment
                            },
                            function(err, result) {
                                if (err)
                                    throw err;
                            });
                        get_event_data(req.params.event_id, "10000", function(data) {
                            send_email_alert_comment(req.params.event_id, req.params.invite_code, req.params.ustatus, req.body.comment, req.body.displayname, data)
                            res.json(data);
                        })
                    } else {
                        get_event_data(req.params.event_id, "10000", function(data) {
                            send_email_alert_rsvp(req.params.event_id, req.params.invite_code, req.params.ustatus, "", req.body.displayname, data)
                            res.json(data);
                        })

                    }
                });
        } else { // player == null
            if (req.params.ustatus != 'none') {
                update_invite_status(players["invite_id"], req.params.ustatus);
                Player.update({
                        event_id: req.params.event_id,
                        invite_code: req.params.invite_code
                    }, {
                        $set: {
                            notice_rsvp: req.body.rsvp,
                            notice_comments: req.body.comment_alert,
                            username: req.body.username,
                            displayname: req.body.displayname,
                            in_or_out: req.params.ustatus
                        }
                    },
                    function(err, result) {
                        if (err)
                            throw err;
                    });
            } // req.params.ustatus != 'none'
            if (req.body.comment != "undefined") {
                Comments.create({
                        event_id: req.params.event_id,
                        displayname: req.body.displayname,
                        text: req.body.comment
                    },
                    function(err, result) {
                        if (err)
                            throw err;
                    });
                get_event_data(req.params.event_id, "10000", function(data) {
                    send_email_alert_comment(req.params.event_id, req.params.invite_code, req.params.ustatus, req.body.comment, req.body.displayname, data)
                    res.json(data);
                })
            } else { // req.body.comment != "undefined"
                get_event_data(req.params.event_id, "10000", function(data) {
                    send_email_alert_rsvp(req.params.event_id, req.params.invite_code, req.params.ustatus, "", req.body.displayname, data)
                    res.json(data);
                })
            }
            io.sockets.emit("getinvite", req.params.invite_code);
        } // else   players = null
    });
});


function send_email_alert_rsvp(event_id, invite_code, ustatus, comment, displayname, event_data) {
    console.log("dfasfdsa 55555555")
    Player.find({
            event_id: event_id,
            notice_rsvp: 'YES'
        },
        function(err, players_list) {
            if (err)
                res.send(err)
            async.each(players_list, function(players, callback) {
                if (invite_code == players.invite_code) {
                    var email_subject = 'you posted an rsvp as ' + displayname + ' for event ' + event_data.event[0]["event_title"]
                    var email_html = 'you posted as ' + displayname + 'a rsvp ' + ustatus + '<br> <a href="' + config.endpoint + '/invite/' + players.invite_code + '">' + event_data.event[0]["event_title"] + '</a>' + ' at ' + event_data.event[0]["event_start"] + '<br>' + 'number of yeses-' + event_data.players_yes.length + '<br>' + 'number of nos-' + event_data.players_no.length
                } else {
                    var email_subject = 'New rsvp posted by ' + displayname + ' for event ' + event_data.event[0]["event_title"]
                    var email_html = displayname + " rsvp'd " + ustatus + '<br> <a href="' + config.endpoint + '/invite/' + players.invite_code + '">' + event_data.event[0]["event_title"] + '</a>' + ' at ' + event_data.event[0]["event_start"] + '<br>' + 'number of yeses-' + event_data.players_yes.length + '<br>' + 'number of nos-' + event_data.players_no.length
                }
                transporter.sendMail({
                    from: config.username,
                    to: players.username,
                    subject: email_subject,
                    html: email_html,
                });
                transporter.close();
            });
        });
}

function send_email_alert_comment(event_id, invite_code, ustatus, comment, displayname, event_data) {

    if (ustatus == 'none') {
        Player.find({
                event_id: event_id,
                notice_comments: 'YES'
            },
            function(err, players_list) {
                if (err)
                    res.send(err)
                async.each(players_list, function(players, callback) {
                    if (invite_code == players.invite_code) {
                        var email_subject = 'you posted comment for event ' + event_data.event[0]["event_title"]
                        var email_html = 'you posted a comment as ' + displayname + '<br>"' + comment + '"<br> for event <a href="' + config.endpoint + '/invite/' + players.invite_code + '">' + event_data.event[0]["event_title"] + '</a>' + ' at ' + event_data.event[0]["event_start"] + '<br>' + 'number of yeses-' + event_data.players_yes.length + '<br>' + 'number of nos-' + event_data.players_no.length

                    } else {
                        var email_subject = 'New comment posted by ' + displayname + ' for event ' + event_data.event[0]["event_title"]
                        var email_html = displayname + ' posted a new comment ' + comment + '<br> <a href="' + config.endpoint + '/invite/' + players.invite_code + '">' + event_data.event[0]["event_title"] + '</a>' + ' at ' + event_data.event[0]["event_start"] + '<br>' + 'number of yeses-' + event_data.players_yes.length + '<br>' + 'number of nos-' + event_data.players_no.length

                    }
                    transporter.sendMail({
                        from: config.username,
                        to: players.username,
                        subject: email_subject,
                        html: email_html,
                        text: 'hello world asd!'
                    });
                    transporter.close();
                });
            });


    } else {

        Player.find({
                $and: [{
                    event_id: event_id
                }, {
                    notice_comments: 'NO'
                }, {
                    notice_rsvp: 'YES'
                }]
            },
            function(err, players_list) {
                if (err)
                    res.send(err)
                async.each(players_list, function(players, callback) {
                    if (invite_code == players.invite_code) {
                        var email_subject = 'you rsvpd ' + ustatus + ' for event ' + event_data.event[0]["event_title"]
                        var email_html = 'you rsvpd ' + ustatus + ' as ' + displayname + '<br>for event <a href="' + config.endpoint + '/invite/' + players.invite_code + '">' + event_data.event[0]["event_title"] + '</a>' + ' at ' + event_data.event[0]["event_start"] + '<br>' + 'number of yeses-' + event_data.players_yes.length + '<br>' + 'number of nos-' + event_data.players_no.length

                    } else {
                        var email_subject = displayname + " rsvp'd " + ustatus + ' for event ' + event_data.event[0]["event_title"]
                        var email_html = displayname + " rsvp'd " + ustatus + '<br>for event <a href="' + config.endpoint + '/invite/' + players.invite_code + '">' + event_data.event[0]["event_title"] + '</a>' + ' at ' + event_data.event[0]["event_start"] + '<br>' + 'number of yeses-' + event_data.players_yes.length + '<br>' + 'number of nos-' + event_data.players_no.length

                    }
                    transporter.sendMail({
                        from: config.username,
                        to: players.username,
                        subject: email_subject,
                        html: email_html,
                    });
                    transporter.close();
                });
            });

        Player.find({
                $and: [{
                    event_id: event_id
                }, {
                    notice_comments: 'YES'
                }, {
                    notice_rsvp: 'NO'
                }]
            },
            function(err, players_list) {
                if (err)
                    res.send(err)
                async.each(players_list, function(players, callback) {
                    if (invite_code == players.invite_code) {
                        var email_subject = 'you posted comment posted as for event ' + event_data.event[0]["event_title"]
                        var email_html = 'you posted a comment as ' + displayname + '<br>"' + comment + '"<br> for event <a href="' + config.endpoint + '/invite/' + players.invite_code + '">' + event_data.event[0]["event_title"] + '</a>' + ' at ' + event_data.event[0]["event_start"] + '<br>' + 'number of yeses-' + event_data.players_yes.length + '<br>' + 'number of nos-' + event_data.players_no.length

                    } else {
                        var email_subject = 'New rsvp posted by ' + displayname + ' for event ' + event_data.event[0]["event_title"]
                        var email_html = displayname + ' posted a new comment ' + comment + '<br> <a href="' + config.endpoint + '/invite/' + players.invite_code + '">' + event_data.event[0]["event_title"] + '</a>' + ' at ' + event_data.event[0]["event_start"] + '<br>' + 'number of yeses-' + event_data.players_yes.length + '<br>' + 'number of nos-' + event_data.players_no.length

                    }
                    transporter.sendMail({
                        from: config.username,
                        to: players.username,
                        subject: email_subject,
                        html: email_html,
                    });
                    transporter.close();
                });
            });

        Player.find({
                $and: [{
                    event_id: event_id
                }, {
                    notice_comments: 'YES'
                }, {
                    notice_rsvp: 'YES'
                }]
            },
            function(err, players_list) {
                if (err)
                    res.send(err)
                async.each(players_list, function(players, callback) {
                    if (invite_code == players.invite_code) {
                        var email_subject = 'You posted a comment and rsvpd for event ' + event_data.event[0]["event_title"]
                        var email_html = 'You rsvpd <b>' + ustatus + ' </b> as displayname <b>' + displayname + '</b><br><br><b>Comment -</b> "' + comment + '"<br><br>For event <a href="' + config.endpoint + '/invite/' + players.invite_code + '">' + event_data.event[0]["event_title"] + '</a>' + ' at ' + event_data.event[0]["event_start"] + '<br><br>' + 'Number of Yeses-' + event_data.players_yes.length + '<br>' + 'Number of Nos-' + event_data.players_no.length

                    } else {
                        var email_subject = 'New comment and rsvp posted by ' + displayname + ' for event ' + event_data.event[0]["event_title"]
                        var email_html = displayname + ' rsvpd ' + ustatus + ' and posted a new comment-"' + comment + '"<br> for event <a href="' + config.endpoint + '/invite/' + players.invite_code + '">' + event_data.event[0]["event_title"] + '</a>' + ' at ' + event_data.event[0]["event_start"] + '<br>' + 'number of yeses-' + event_data.players_yes.length + '<br>' + 'number of nos-' + event_data.players_no.length

                    }
                    transporter.sendMail({
                        from: config.username,
                        to: players.username,
                        subject: email_subject,
                        html: email_html,
                        text: 'hello world asd!'
                    });
                    transporter.close();
                });
            });
    }
}

apiRoutes.get('/adduserevent/:event_id/:ustatus', function(req, res) {
    Player.findOne({
        event_id: req.params.event_id,
        username: req.decoded._doc.username
    }, function(error, players) {
        if (error)
            res.json(error);
        if (players == null) {
            Player.create({
                    event_id: req.params.event_id,
                    username: req.decoded._doc.username,
                    user_id: req.decoded._doc._id,
                    in_or_out: req.params.ustatus
                },
                function(err, result) {
                    if (err)
                        throw err;
                    //       res.json(result);
                });
        } else {
            update_invite_status(players["invite_id"], req.params.ustatus);
            Player.update({
                    event_id: req.params.event_id,
                    username: req.decoded._doc.username
                }, {
                    $set: {
                        in_or_out: req.params.ustatus
                    }
                },
                function(err, result) {
                    if (err)
                        throw err;
                    //        res.json(result);
                });
        }
        get_event_data(req.params.event_id, req.decoded._doc._id, function(data) {
            res.json(data);
        })
    });
});


apiRoutes.post('/sendsms/:event_id/', function(req, res) {

    Event.find({
            _id: req.params.event_id
        },
        function(err, events) {
            if (err)
                throw err;
            Invite.create({
                    event_id: req.params.event_id,
                    inviter: req.decoded._doc.username,
                    invited: req.body.text,
                    invited_email: req.body.email,
                    invited_phone: req.body.phone,
                    invited_type: req.body.type,
                    invite_code: randomValueHex(8),
                    invite_status: "Sent"
                },
                function(err, new_invite) {
                    console.log(events[0]["event_title"])
                    console.log("dksakdfksafkads")
                    client.sendMessage({

                        to: '+1' + req.body.phone, // Any number Twilio can deliver to
                        from: '+14152149049', // A number you bought from Twilio and can use for outbound communication
                        //body: req.body.sms_type // body of the SMS message
                        body: "fdsafsafdsfdsafdsafdas"

                    }, function(err, responseData) { //this function is executed when a response is received from Twilio

                        if (!err) { // "err" is an error received during the request, if any

                        }
                    });
                    if (err)
                        throw err;
                    Invite.find({
                            event_id: req.params.event_id
                        },
                        null, {
                            sort: {
                                "created_at": -1
                            }
                        },
                        function(err, invites) {
                            if (err)
                                res.send(err)
                            res.json({
                                'invites': invites
                            });
                        });
                }); //d8d88d
        });
});
apiRoutes.post('/addinvite/:event_id/', function(req, res) {

    Event.find({
            _id: req.params.event_id
        },
        function(err, events) {
            if (err)
                throw err;
            Invite.create({
                    event_id: req.params.event_id,
                    inviter: req.decoded._doc.username,
                    invited: req.body.text,
                    invited_email: req.body.email,
                    invited_phone: req.body.phone,
                    invited_type: req.body.type,
                    invite_code: randomValueHex(8),
                    invite_status: "Sent"
                },
                function(err, new_invite) {
                    console.log(events[0]["event_title"])
                    transporter.sendMail({
                        from: config.username,
                        to: req.body.email,
                        subject: 'You are invited to the event ' + events[0]["event_title"] + ' at ' + events[0]["event_start"],
                        html: 'You are invited to the event <a href="' + config.endpoint + '/invite/' + new_invite.invite_code + '">' + events[0]["event_title"] + '</a>' + ' at ' + events[0]["event_start"],
                    });
                    transporter.close();
                    if (err)
                        throw err;
                    Invite.find({
                            event_id: req.params.event_id
                        },
                        null, {
                            sort: {
                                "created_at": -1
                            }
                        },
                        function(err, invites) {
                            if (err)
                                res.send(err)
                            res.json({
                                'invites': invites
                            });
                        });
                }); //d8d88d
        });
});
apiRoutes.post('/addcomment/:event_id/', function(req, res) {
    async.series([
        function(callback) {
            Player.findOne({
                event_id: req.params.event_id
            }, function(error, comments) {
                if (error) {
                    res.json(error);
                } else if (comments == null) {} else {
                    Comments.create({
                            event_id: req.params.event_id,
                            displayname: req.decoded._doc.displayname,
                            user_id: req.decoded._doc._id,
                            text: req.body.text
                        },
                        function(err, result) {
                            if (err)
                                throw err;
                            callback(null, 'one');
                        });
                };
            });
        },
        function(callback) {
            get_event_data(req.params.event_id, req.decoded._doc._id, function(data) {
                res.json(data);
            })
            callback();
        }
    ], function(error) {
        if (error) {
            //handle readFile error or processFile error here
        }
    });
});

function get_event_data(event_id, user_id, callback) {

    var pushY = {};
    Comments.find({
            event_id: event_id
        }, null, {
            sort: {
                "created_at": -1
            }
        },
        function(err, comments) {
            if (err)
                res.send(err)
            Player.find({
                    event_id: event_id,
                    in_or_out: 'Yes'
                },
                function(err, players_yes) {
                    if (err)
                        res.send(err)
                    Player.find({
                            event_id: event_id,
                            invite_code: user_id
                        },
                        function(err, is_member) {
                            if (err)
                                res.send(err)
                            Player.find({
                                    event_id: event_id,
                                    in_or_out: 'No'
                                },
                                function(err, players_no) {
                                    if (err)
                                        res.send(err)
                                    Player.find({
                                            event_id: event_id,
                                            in_or_out: 'Maybe'
                                        },
                                        function(err, players_maybe) {
                                            if (err)
                                                res.send(err)
                                            Event.find({
                                                    _id: event_id
                                                },
                                                function(err, events) {
                                                    if (err)
                                                        res.send(err)
                                                    Player.find({
                                                            event_id: event_id
                                                        },
                                                        function(err, players_list) {
                                                            if (err)
                                                                res.send(err)
                                                            async.each(players_list, function(events, callback) {
                                                                User.findOne({
                                                                        _id: events.user_id
                                                                    },
                                                                    function(err, user_list) {
                                                                        if (err)
                                                                            res.send(err)
                                                                            //pushY[events.user_id] = (user_list.fname + user_list.password.substring(0, 1)).toString()
                                                                        callback();
                                                                    });
                                                            }, function(err) {

                                                                var data = ({
                                                                    //  'user_list': [pushY],

                                                                    'logged_in_userid': user_id,
                                                                    'event': events,
                                                                    'players_list': players_list,
                                                                    'is_member': is_member,
                                                                    'players_yes': players_yes,
                                                                    'players_no': players_no,
                                                                    'players_maybe': players_maybe,
                                                                    'comments': comments,
                                                                });
                                                                return callback(data);
                                                            });
                                                        });
                                                });
                                        });
                                });
                        });
                });
        });
}

apiRoutes.get('/geteventdata/:event_id', function(req, res) {
    get_event_data(req.params.event_id, req.decoded._doc._id, function(data) {
        res.json(data);
    })
});

app.get('/geteventinviteanon/:invite_code', function(req, res) {
    Invite.findOne({
            invite_code: req.params.invite_code
        },
        function(err, invites) {
            if (err)
                res.send(err)
            if (invites) {
                if (invites["invite_status"] == "Opened" || invites["invite_status"] == "Sent") {
                    update_invite_status(invites["_id"], "Opened");
                }
                get_event_data(invites.event_id, req.params.invite_code, function(data) {
                    res.json(data);
                })
            } else {
                return res.status(403).send({
                    success: false,
                    message: 'No Invite for that code.'
                });
            }
        });
});
apiRoutes.get('/geteventinvite/:invite_code', function(req, res) {
    Invite.findOne({
            invite_code: req.params.invite_code
        },
        function(err, invites) {
            if (err)
                res.send(err)
            if (invites) {
                if (invites["invite_status"] == "Opened" || invites["invite_status"] == "Sent") {
                    update_invite_status(invites["_id"], "Opened");
                }
                get_event_data(invites.event_id, req.params.invite_code, function(data) {
                    res.json(data);
                })
            } else {
                return res.status(404).send({
                    success: false,
                    message: 'No Invite for that code.'
                });
            }
        });
});

apiRoutes.get('/geteventdata1/:event_id', function(req, res) {
    var pushY = {};
    Comments.find({
            event_id: req.params.event_id
        }, null, {
            sort: {
                "created_at": -1
            }
        },
        function(err, comments) {
            if (err)
                res.send(err)
            Player.find({
                    event_id: req.params.event_id,
                    in_or_out: 'Yes'
                },
                function(err, players_yes) {
                    if (err)
                        res.send(err)
                    Player.find({
                            event_id: req.params.event_id,
                            in_or_out: 'No'
                        },
                        function(err, players_no) {
                            if (err)
                                res.send(err)
                            Event.find({
                                    _id: req.params.event_id
                                },
                                function(err, events) {
                                    if (err)
                                        res.send(err)
                                    Player.find({
                                            event_id: req.params.event_id
                                        },
                                        function(err, players_list) {
                                            if (err)
                                                res.send(err)
                                            async.each(players_list, function(events, callback) {
                                                User.findOne({
                                                        _id: events.user_id
                                                    },
                                                    function(err, user_list) {
                                                        if (err)
                                                            res.send(err)
                                                        pushY[events.user_id] = (user_list.fname + user_list.password.substring(0, 1)).toString()
                                                        callback();
                                                    });
                                            }, function(err) {
                                                //     res.json({ 'my_events': player_data,
                                                //               'event_yes': [pushY] ,
                                                //              'event_no': [pushN] 
                                                //           });
                                                //  });


                                                res.json({
                                                    'user_list': [pushY],
                                                    'logged_in_userid': req.decoded._doc._id,
                                                    'logged_in_username': req.decoded._doc.username,
                                                    'event': events,
                                                    'players_list': players_list,
                                                    'players_yes': players_yes,
                                                    'players_no': players_no,
                                                    'comments': comments,
                                                });
                                            });
                                        });
                                });
                        });
                });
        });
});
apiRoutes.post('/eventsave/:event_id', function(req, res) {
    console.log(req.body)
    Event.update({
            _id: req.params.event_id
        }, {
            $set: {
                event_title: req.body.event_title,
                event_location: req.body.event_location,
                event_start: req.body.event_start
                    //event_image: req.body.image
            }
        },
        function(err, result) {
            if (err)
                throw err;
            console.log(result)
            res.json(result);
        });
});

app.get('/invites/:invite_code', function(req, res) {
    Invite.findOne({
            invite_code: req.params.invite_code
        },
        function(err, invites) {
            if (err)
                res.send(err)
            if (invites) {
                if (invites["invite_status"] == "Opened" || invites["invite_status"] == "Sent") {
                    update_invite_status(invites["_id"], "Opened");
                }
                res.json(invites);
            } else {
                return res.status(403).send({
                    success: false,
                    message: 'No Invite for that code.'
                });
            }
        });
});

apiRoutes.get('/invitedetail/:invite_id', function(req, res) {
    Invite.findOne({
            _id: req.params.invite_id
        },
        function(err, invites) {
            if (err)
                res.send(err)
                //    }
            res.json({
                'invite_detail': [invites]
            });
        });
});

apiRoutes.get('/invited/:event_id', function(req, res) {
    Invite.find({
            event_id: req.params.event_id
        },
        null, {
            sort: {
                "created_at": -1
            }
        },
        function(err, invites) {
            if (err)
                res.send(err)
            Event.find({
                    _id: req.params.event_id
                },
                function(err, events) {
                    if (err)
                        res.send(err)
                    Invite.findOne({
                            event_id: req.params.event_id,
                            event_creator: 'Yes'
                        },
                        function(err, invite_creator) {
                            if (err)
                                res.send(err)
                            res.json({
                                'logged_in_userid': req.decoded._doc._id,
                                'invite_creator': invite_creator,
                                'event': events,
                                'invites': invites
                            });
                        });
                });
        });
});
apiRoutes.get('/events/:event_id', function(req, res) {

    Event.find({
            _id: req.params.event_id
        },
        function(err, events) {
            if (err)
                res.send(err)
            res.json(events);
        });
});

function update_invite_status(invite_id, ustatus) {
    Invite.update({
            _id: invite_id
        }, {
            $set: {
                invite_status: ustatus,
                date_opened: new Date()
            }
        },
        function(err, result) {
            if (err)
                throw err;
        });
}

function update_invite_status_displayname(invite_id, ustatus, displayname, username) {
    Invite.update({
            _id: invite_id
        }, {
            $set: {
                invite_status: ustatus,
                invited_email: username,
                accepted_displayname: displayname,
                date_opened: new Date()
            }
        },
        function(err, result) {
            if (err)
                throw err;
        });
}

function update_invite_status_accepted(invite_id, ustatus) {
    Invite.update({
            _id: invite_id
        }, {
            $set: {
                invite_status: ustatus,
                date_accepted: new Date()
            }
        },
        function(err, result) {
            if (err)
                throw err;
        });
}

function add_invite_username(invite_id, username) {
    Invite.update({
            _id: invite_id
        }, {
            $set: {
                invited_username: username
            }
        },
        function(err, result) {
            if (err)
                throw err;
        });
}

apiRoutes.get('/change_invite_status/:invite_code', function(req, res) {
    Invite.findOne({
        invite_code: req.params.invite_code
    }, function(error, invites) {
        if (error)
            res.json(error);
        update_invite_status_accepted(invites["_id"], "Accepted");
        add_invite_username(invites["_id"], req.decoded._doc.username);
        Player.create({
                event_id: invites["event_id"],
                invite_id: invites["_id"],
                username: req.decoded._doc.username,
                user_id: req.decoded._doc._id,
                in_or_out: "Accepted"
            },
            function(err, result) {
                if (err)
                    throw err;
                res.json(result);
            });
    });
});

app.get('/smsdata', function(req, res) {
    Invite.create({
            event_id: '573df302ff23ec9151000002',
            invited_email: req.query.From,
            invite_status: req.query.MediaUrl0
        },
        function(err, result) {
            if (err)
                throw err;
        });
    io.sockets.emit("mms", '573df302ff23ec9151000002');
});

apiRoutes.get('/event_list', function(req, res) {
    Event.find(function(err, events) {
        if (err)
            res.send(err)
        res.json(events);
    });
});
apiRoutes.get('/userget', function(req, res) {
    console.log("fsdfasfdas 4444")
    console.log(req.decoded._doc._id)
    User.find({
            _id: req.decoded._doc._id
        },
        function(err, users) {
            if (err)
                res.send(err)
            res.json({
                'user': users,
            });
        });
});

apiRoutes.post('/passwordsave', function(req, res) {
    User.update({
            _id: req.decoded._doc._id
        }, {
            $set: {
                password: req.body.password
            }
        },
        function(err, users) {
            if (err)
                throw err;
            //res.json(result);
            res.json({
                'user': users,
            });
        });
});

apiRoutes.post('/usersave', function(req, res) {
    User.update({
            _id: req.decoded._doc._id
        }, {
            $set: {
                username: req.body.username,
                displayname: req.body.displayname
            }
        },
        function(err, users) {
            if (err)
                throw err;
            //res.json(result);
            res.json({
                'user': users,
            });
        });
});

apiRoutes.get('/my_event_list2', function(req, res) {
    var player_data = []
    var player_data2 = []
    var player_data3 = []
    var player_no_count = []
    var pushY = {};
    var pushN = {};
    var pushList = {};
    var invites_cnt = {};
    Player.find({
            user_id: req.decoded._doc._id
        }, null, {
            sort: {
                "created_at": -1
            }
        },
        function(err, records) {
            async.each(records, function(events, callback) {
                Event.findOne({
                        _id: events.event_id
                    },
                    function(err, events2) {
                        if (err)
                            res.send(err)
                        player_data.push(events2);
                    });
                Player.count({
                        event_id: events.event_id,
                        in_or_out: 'No'
                    },
                    function(err, players_no) {
                        if (err)
                            res.send(err)
                        Player.count({
                                event_id: events.event_id,
                                in_or_out: 'Yes'
                            },
                            function(err, players_yes) {
                                if (err)
                                    res.send(err)
                                Invite.count({
                                        event_id: events.event_id
                                    },
                                    function(err, invite_count) {
                                        if (err)
                                            res.send(err)
                                            //            Player.find({event_id: events.event_id},
                                        Player.find({
                                                user_id: req.decoded._doc._id,
                                                event_id: events.event_id
                                            },
                                            function(err, players_list) {
                                                if (err)
                                                    res.send(err)
                                                    // player_data3.push(players_list);
                                                pushList[events.event_id] = players_list
                                                pushN[events.event_id] = players_no
                                                pushY[events.event_id] = players_yes
                                                invites_cnt[events.event_id] = invite_count
                                                callback();
                                            });
                                    });
                            });
                    });
            }, function(err) {
                res.json({
                    'my_events': player_data,
                    'event_yes': [pushY],
                    'event_invites': [pushList],
                    //  'event_invites': player_data3,
                    'event_no': [pushN],
                    'invites': [invites_cnt]
                });
            });
        });
});
apiRoutes.get('/my_event_list', function(req, res) {
    Event.find({
            event_creator: req.decoded._doc._id
        },
        null, {
            sort: {
                "created_at": -1
            }
        },
        function(err, events) {
            if (err)
                res.send(err)
            res.json({
                'my_events': events,
            });
        });
});

apiRoutes.post('/new_event', function(req, res) {

    console.log("fasdfadsfdsf")
    console.log(req.decoded._doc)
    User.findOne({
        _id: req.decoded._doc._id
    }, function(err, user) {

        if (err)
            throw err;
        Event.create({
            event_title: req.body.text,
            event_start: req.body.event_start,
            event_location: req.body.event_location,
            event_creator: req.decoded._doc._id,
            event_creator_displayname: user.displayname

        }, function(err, event_created) {
            if (err)
                res.send(err);
            Invite.create({
                    event_id: event_created._id,
                    inviter: user.username,
                    invited: user.displayname,
                    invited_email: user.username,
                    //     invited_email: req.body.email,
                    //    invited_phone: req.body.phone,
                    //     invited_type: req.body.type,
                    invite_code: randomValueHex(8),
                    event_creator: "Yes",
                    invite_status: "Yes"
                },
                function(err, new_invite) {
                    Player.create({
                            event_id: event_created._id,
                            displayname: user.displayname,
                            invite_code: new_invite.invite_code,
                            username: user.username,
                            notice_rsvp: 'YES',
                            notice_comments: 'YES',
                            user_id: req.decoded._doc._id,
                            in_or_out: 'Yes'
                        },
                        function(err, result) {
                            if (err)
                                throw err;
                            transporter.sendMail({
                                from: config.username,
                                to: user.username,
                                subject: 'You created the event ' + event_created.event_title + ' at ' + event_created.event_start,
                                html: 'You created the event <a href="' + config.endpoint + '/invite/' + new_invite.invite_code + '">' + event_created.event_title + '</a>' + ' at ' + event_created.event_start,
                            });
                            transporter.close();
                            if (err)
                                throw err;
                        }); //d8d88d
                });
            Event.find(function(err, events) {
                if (err)
                    res.send(err)
                res.json(events);
            });
        });
    });
});

apiRoutes.delete('/events/:event_id', function(req, res) {
    console.log("fsdfasfdas 4444")
    console.log(req.params.event_id)
    Event.remove({
        _id: req.params.event_id
    }, function(err, events) {
        if (err) res.send(err);
        Player.remove({
            event_id: req.params.event_id
        }, function(err, players) {
            if (err) res.send(err);
            res.json(events);
        });
    });
});
app.use('/api', apiRoutes);
app.use(function(req, res) {
    res.sendfile('./public/index.html'); // load the single view file (angular will handle the page changes on the front-end)
});
// listen (start app with node server.js) ======================================
//app.listen(config.port_endpoint);
server.listen(config.port_endpoint);
console.log("App listening on port " + config.port_endpoint);

const express = require('express');
const session = require('express-session');
const RedisStore = require('connect-redis')(session);
const { promisify } = require('util');
const { formatDistance } = require('date-fns');
const path = require('path');
const bcrypt = require('bcrypt');
const redis = require('redis');
const app = express();
const client = redis.createClient();
const PORT = process.env.PORT || 3000;

const ahget = promisify(client.hget).bind(client)
const asmembers = promisify(client.smembers).bind(client)
const ahkeys = promisify(client.hkeys).bind(client)
const aincr = promisify(client.incr).bind(client)
const alrange = promisify(client.lrange).bind(client)

app.use(express.urlencoded({extended: true}));
app.use(
  session({
    store: new RedisStore({ client: client }),
    resave: true,
    saveUninitialized: true,
    cookie: {
      maxAge: 36000000,
      httpOnly: false,
      secure: false, //for it to work locally
    },
    secret: 'ckVZ6eX4CDcuFla0VKAUZWefWMhkPOp6',
  })
)
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));


app.get('/', async (req, res) => {
  if (req.session.userid) {
    const currentUserName = await ahget(`user:${req.session.userid}`, 'username')
    const following = await asmembers(`following:${currentUserName}`)
    const users = await ahkeys('users')

    const timeline = []
    const posts = await alrange(`timeline:${currentUserName}`, 0, 100)

    for (post of posts) {
      const timestamp = await ahget(`post:${post}`, "timestamp")
      const timeString = formatDistance(new Date(), new Date(parseInt(timestamp)))

      timeline.push({
        message: await ahget(`post:${post}`, "message"),
        author: await ahget(`post:${post}`, "username"),
        timeString: timeString,
      })
    }

    res.render('dashboard', {
      users: users.filter((user) => user !== currentUserName && following.indexOf(user) === -1),
      currentUserName,
      timeline
    })
  } else {
    res.render('login')
  }
});

app.get('/post', (req, res) => {
  if (req.session.userid) {
    res.render('post');
  } else {
    res.render('login');
  }
});

app.post('/', (req, res) => {
  const { username, password } = req.body;

  const saveSessionAndRenderDashboard = (userid) => {
    req.session.userid = userid
    req.session.save()
    res.redirect('/')
  }

  const handleSignup = (username, password) => {
    client.incr('userid', async (err, userid) => {
      client.hset('users', username, userid)

      const saltRounds = 10
      const hash = await bcrypt.hash(password, saltRounds)

      client.hset(`user:${userid}`, 'hash', hash, 'username', username)

      saveSessionAndRenderDashboard(userid)
    })
  }

  const handleLogin = (userid, password) => {
    client.hget(`user:${userid}`, 'hash', async (err, hash) => {
      const result = await bcrypt.compare(password, hash)
      if (result) {
        saveSessionAndRenderDashboard(userid)
      } else {
        res.render('error', {
          message: 'Incorrect password',
        })
        return
      }
    })
  }

  if (!username || !password) {
    res.render('error', {
      message: 'Please set both username and password',
    })
    return
  }

  client.hget('users', username, (err, userid) => {
    if (!userid) {
      handleSignup(username, password);
    } else {
      handleLogin(userid, password);
    }
  })
  console.log(req.body, username, password)
});

app.post('/post', async (req, res) => {
  if (!req.session.userid) {
    res.redirect('/');
    return
  }

  const { message } = req.body;
  const currentUserName = await ahget(`user:${req.session.userid}`, 'username')

  const postid = await aincr('postid')
  client.hmset(
    `post:${postid}`,
    'userid',
    req.session.userid,
    'username',
    currentUserName,
    'message',
    message,
    'timestamp',
    Date.now()
  )
  client.lpush(`timeline:${currentUserName}`, postid)

  const followers = await asmembers(`followers:${currentUserName}`)
  for (follower of followers) {
    client.lpush(`timeline:${follower}`, postid)
  }

  res.redirect('/');
});

app.post('/follow', (req, res) => {
  if (!req.session.userid) {
    res.redirect('/');
    return
  }

  const { username } = req.body;

  client.hget(
    `user:${req.session.userid}`,
    'username',
    (err, currentUserName) => {
      client.sadd(`following:${currentUserName}`, username);
      client.sadd(`followers:${username}`, currentUserName);
    }
  )

  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`server ready on ${PORT}`);
});

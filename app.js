const Prismic = require('prismic-javascript');
const PrismicDOM = require('prismic-dom');
const request = require('request');
const Cookies = require('cookies');
const PrismicConfig = require('./prismic-configuration');
const Onboarding = require('./onboarding');
const app = require('./config');
const RSS = require('rss');
const xml = require('xml');

const PORT = app.get('port');

app.listen(PORT, () => {
  Onboarding.trigger();
  process.stdout.write(`Point your browser to: http://localhost:${PORT}\n`);
});

// Middleware to inject prismic context
app.use((req, res, next) => {
  res.locals.ctx = {
    endpoint: PrismicConfig.apiEndpoint,
    linkResolver: PrismicConfig.linkResolver,
  };
  // add PrismicDOM in locals to access them in templates.
  res.locals.PrismicDOM = PrismicDOM;
  Prismic.api(PrismicConfig.apiEndpoint, {
    accessToken: PrismicConfig.accessToken,
    req,
  }).then((api) => {
    req.prismic = { api };
    next();
  }).catch((error) => {
    next(error.message);
  });
});

/*
 *  --[ INSERT YOUR ROUTES HERE ]--
 */

/*
 * Route with documentation to build your project with prismic
 */
app.get('/', (req, res) => {
  res.redirect('/feed');
});

/*
 * Prismic documentation to build your project with prismic
 */
app.get('/help', (req, res) => {
  const repoRegexp = /^(https?:\/\/([-\w]+)\.[a-z]+\.(io|dev))\/api(\/v2)?$/;
  const [_, repoURL, name, extension, apiVersion] = PrismicConfig.apiEndpoint.match(repoRegexp);
  const { host } = req.headers;
  const isConfigured = name !== 'your-repo-name';
  res.render('help', {
    isConfigured,
    repoURL,
    name,
    host,
  });
});

/*
 * Preconfigured prismic preview
 */
app.get('/preview', (req, res) => {
  const { token } = req.query;
  if (token) {
    req.prismic.api.previewSession(token, PrismicConfig.linkResolver, '/').then((url) => {
      const cookies = new Cookies(req, res);
      cookies.set(Prismic.previewCookie, token, { maxAge: 30 * 60 * 1000, path: '/', httpOnly: false });
      res.redirect(302, url);
    }).catch((err) => {
      res.status(500).send(`Error 500 in preview: ${err.message}`);
    });
  } else {
    res.send(400, 'Missing token from querystring');
  }
});

app.get('/article/:uid', (req, res, next) => {
  // We store the param uid in a variable
  const { uid } = req.params;
  // We are using the function to get a document by its uid field
  req.prismic.api.getByUID('article', uid).then((document) => {
    // document is a document object, or null if there is no match
    if (document) {
      // Render the 'page' pug template file (page.pug)
      res.render('article', { document });
    } else {
      res.status(404).send('404 not found');
    }
  }).catch((error) => {
    next(`error when retriving page ${error.message}`);
  });
});

app.get('/feed', (req, res, next) => {
  req.prismic.api.query('').then((response) => {
    if (response) {
      /* lets create an rss feed */
      let feed = new RSS({
        title: 'Prismic Feed',
        description: 'Get the latest docs from Prismic',
        site_url: 'http://example.com',
      });

      /* loop over data and add to feed */
      response.results.forEach((document) => {
        feed.item({
          title: PrismicDOM.RichText.asText(document.data.title),
          description: PrismicDOM.RichText.asText(document.data.description),
          url: 'http://example.com/article4?this&that', // link to the item
          date: 'May 27, 2012', // any format that js Date can parse.
          custom_elements: [
            { 'content:encoded': PrismicDOM.RichText.asHtml(document.data.content, PrismicConfig.linkResolver) },
          ],
        });
      });

      // cache the xml to send to clients
      const xmlContent = feed.xml();
      // console.log(xmlContent);
      res.set('Content-Type', 'text/xml');
      res.send(xmlContent);
    } else {
      res.status(404).send('404 not found');
    }
  }).catch((error) => {
    next(`error when retriving content ${error.message}`);
  });
});

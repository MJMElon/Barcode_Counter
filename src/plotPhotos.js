import { registerShippedPhotos } from './modules/palms/data.js';

// Every photo in src/plot-maps, keyed by the plot it belongs to.
//
// The point of reading the folder rather than keeping a list is that adding a
// plot's photo is then one action — drop b2.jpeg in — instead of a file plus a
// code change somebody has to remember. See that folder's README.
//
// import.meta.glob is Vite's, resolved at build time, which is why this sits
// in its own module imported from the app entry: the data layer stays plain
// JavaScript that a plain Node script can import and test.
const files = import.meta.glob('./plot-maps/*.{jpeg,jpg,JPEG,JPG,png,PNG,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const byPlot = {};
Object.entries(files).forEach(([path, url]) => {
  const name = path.split('/').pop().replace(/\.[^.]+$/, '').toUpperCase();
  byPlot[name] = url;
});

registerShippedPhotos(byPlot);

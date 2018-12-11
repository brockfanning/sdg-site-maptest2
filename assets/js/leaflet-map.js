var mymap = L.map('leaflet').setView([55.7656678, -3.7666251], 5);
L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}', {
  attribution: 'Blah blah',
  maxZoom: 18,
  id: 'mapbox.light',
  accessToken: 'pk.eyJ1IjoiYnJvY2tmYW5uaW5nMSIsImEiOiJjaXplbmgzczgyMmRtMnZxbzlmbGJmdW9pIn0.LU-BYMX69uu3eGgk0Imibg'
}).addTo(mymap);

function style(feature) {
  return {
    fillColor: '#666666',
    weight: 1,
    opacity: 1,
    color: 'white',
    dashArray: '3',
    fillOpacity: 0.7
  };
}

$.getJSON('https://geoportal1-ons.opendata.arcgis.com/datasets/686603e943f948acaa13fb5d2b0f1275_4.geojson', function (geojson) {
  L.geoJson(geojson, {style: style}).addTo(mymap);
});

$('.leaflet .nav-link').click(function() {
  setTimeout(function() {
    jQuery('#leaflet .loader').hide();
    mymap.invalidateSize();
  }, 500);
});

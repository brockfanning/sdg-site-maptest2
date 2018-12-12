/**
 * TODO:
 * Integrate with high-contrast switcher.
 */
(function($, L, window, document) {

  // Create the defaults once
  var defaults = {

    // Options for using tile imagery with leaflet.
    tileURL: 'https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}',
    tileOptions: {
      id: 'mapbox.light',
      accessToken: '[replace me]',
      attribution: '[replace me]',
    },
    // Zoom limits.
    minZoom: 5,
    maxZoom: 10,
    // Visual/choropleth considerations.
    colorSteps: L.ColorBrewer.Sequential.Oranges[5],
  };

  // Defaults for each geoLayer.
  var geoLayerDefaults = {
    min_zoom: 0,
    max_zoom: 20,
    styleOptions: {
      weight: 1,
      opacity: 1,
      color: '#888',
      fillOpacity: 0.7
    },
    styleOptionsSelected: {
      color: '#111',
    },
  }

  function Plugin(element, options) {

    this.element = element;
    this.options = $.extend(true, {}, defaults, options);

    // Require at least one geoLayer.
    if (!this.options.geoLayers.length) {
      console.log('Map disabled, no geoLayers in options.');
      return;
    }

    // Apply geoLayer defaults.
    for (var i = 0; i < this.options.geoLayers.length; i++) {
      this.options.geoLayers[i] = $.extend(true, {}, geoLayerDefaults, this.options.geoLayers[i]);
    }

    this._defaults = defaults;
    this._name = 'sdgMap';

    this.valueRange = [_.min(_.pluck(this.options.geoData, 'Value')), _.max(_.pluck(this.options.geoData, 'Value'))];
    this.years = _.uniq(_.pluck(this.options.geoData, 'Year'));
    this.currentYear = this.years[0];

    // Use the ZoomShowHide library to control visibility ranges.
    this.zoomShowHide = new ZoomShowHide();

    // These variables will be set later.
    this.map = null;

    this.init();
  }

  Plugin.prototype = {

    // Move the name data from GeoJson to the data records.
    addNamesToRecords: function(features, idProperty, nameProperty) {
      var featuresIndex = _.indexBy(_.map(features, function(feature) {
        return feature.properties;
      }), idProperty);
      this.options.geoData.forEach(function(record) {
        if (featuresIndex[record.GeoCode]) {
          record.GeoJsonName = featuresIndex[record.GeoCode][nameProperty];
        }
      });
    },

    // Get only the visible GeoJSON layer.
    getVisibleLayer: function() {
      // Unfortunately relies on an internal of the ZoomShowHide library.
      return this.zoomShowHide._layerGroup.getLayers()[0];
    },

    // Zoom to a feature.
    zoomToFeature: function(layer) {
      this.map.fitBounds(layer.getBounds());
    },

    init: function() {

      // Create the map.
      this.map = L.map(this.element, {
        minZoom: this.options.minZoom,
        maxZoom: this.options.maxZoom,
      });
      this.map.setView([0, 0], 0);
      this.zoomShowHide.addTo(this.map);

      // Add full-screen button.
      this.map.addControl(new L.Control.Fullscreen());

      // Add Leaflet DVF legend.
      this.map.addControl(new L.Control.Legend());

      // Add tile imagery.
      L.tileLayer(this.options.tileURL, this.options.tileOptions).addTo(this.map);

      // Because after this point, "this" rarely works.
      var plugin = this;

      // Add the time dimension stuff.
      // Hardcode the timeDimension to year intervals, because this is the SDGs.
      var timeDimension = new L.TimeDimension({
        period: 'P1Y',
        timeInterval: this.years[0] + '-01-02/' + this.years[this.years.length - 1] + '-01-02',
        currentTime: new Date(this.years[0] + '-01-02').getTime(),
      });
      // Save the timeDimension on the map so that it can be used by all layers.
      this.map.timeDimension = timeDimension;
      // Create the player. @TODO: Make these options configurable?
      var player = new L.TimeDimension.Player({
        transitionTime: 1000,
        loop: false,
        startOver:true
      }, timeDimension);
      // Create the control. @TODO: Make these options configurable?
      var timeDimensionControlOptions = {
        player: player,
        timeDimension: timeDimension,
        position: 'bottomleft',
        timeSliderDragUpdate: true,
        speedSlider: false,
      };
      // We have to hijack the control to set the output format.
      // @TODO: Create PR to make this configurable - this is a common need.
      L.Control.TimeDimensionCustom = L.Control.TimeDimension.extend({
        _getDisplayDateFormat: function(date){
          return date.getFullYear();
        }
      });
      var timeDimensionControl = new L.Control.TimeDimensionCustom(timeDimensionControlOptions);
      this.map.addControl(timeDimensionControl);
      // Listen to year changes to update the map colors.
      timeDimension.on('timeload', function(e) {
        plugin.currentYear = new Date(e.time).getFullYear();
        plugin.getVisibleLayer().reloadData();
      });

      // At this point we need to load the GeoJSON layer/s.
      var geoURLs = this.options.geoLayers.map(function(item) {
        return $.getJSON(item.serviceUrl);
      });
      $.when.apply($, geoURLs).done(function() {

        var geoJsons = arguments;
        for (var i in geoJsons) {

          var geoJson = geoJsons[i][0];
          var idProperty = plugin.options.geoLayers[i].idProperty;
          var nameProperty = plugin.options.geoLayers[i].nameProperty;
          var colorFunction = new L.CustomColorFunction(plugin.valueRange[0], plugin.valueRange[1], plugin.options.colorSteps, {
            interpolate: true,
          });
          plugin.addNamesToRecords(geoJson.features, idProperty, nameProperty);

          var choroplethOptions = {
            recordsField: null,
            locationMode: L.LocationModes.LOOKUP,
            locationLookup: geoJson,
            codeField: 'GeoCode',
            locationIndexField: idProperty,
            locationTextField: 'GeoJsonName',
            filter: function(record) {
              return record.Year == plugin.currentYear;
            },
            displayOptions: {
              Value: {
                displayName: 'Value',
                fillColor: colorFunction,
                color: colorFunction,
              },
            },
            layerOptions: {
              fillOpacity: 0.8,
              opacity: 1,
              weight: 1,
              //numberOfSides: 50
            },
            tooltipOptions: {
              iconSize: new L.Point(80,55),
              iconAnchor: new L.Point(-5,55)
            },
            getIndexKey: function (location, record) {
              return record.GeoCode + '-' + record.Year;
            }
          };

          var layer = new L.ChoroplethDataLayer(plugin.options.geoData, choroplethOptions);
          layer.min_zoom = plugin.options.geoLayers[i].min_zoom;
          layer.max_zoom = plugin.options.geoLayers[i].max_zoom;
          // Add the layer to the ZoomShowHide group.
          plugin.zoomShowHide.addLayer(layer);
        }
      });

      // Leaflet needs "invalidateSize()" if it was originally rendered in a
      // hidden element. So we need to do that when the tab is clicked.
      $('.map .nav-link').click(function() {
        setTimeout(function() {
          $('#map #loader-container').hide();
          // Fix the size.
          plugin.map.invalidateSize();
          // Also zoom in/out as needed.
          plugin.zoomToFeature(plugin.getVisibleLayer());
          // Limit the panning to what we care about.
          plugin.map.setMaxBounds(plugin.getVisibleLayer().getBounds());
          // Make sure the map is not too high.
          var heightPadding = 50;
          var maxHeight = $(window).height() - heightPadding;
          if ($('#map').height() > maxHeight) {
            $('#map').height(maxHeight);
          }
        }, 500);
      });
    },
  };

  // A really lightweight plugin wrapper around the constructor,
  // preventing against multiple instantiations
  $.fn['sdgMap'] = function(options) {
    return this.each(function() {
      if (!$.data(this, 'plugin_sdgMap')) {
        $.data(this, 'plugin_sdgMap', new Plugin(this, options));
      }
    });
  };
})(jQuery, L, window, document);

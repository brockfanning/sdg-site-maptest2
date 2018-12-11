/**
 * TODO:
 * Integrate with high-contrast switcher.
 */
(function($, L, chroma, window, document, undefined) {

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
    colorRange: ['#b4c5c1', '#004433'],
    noValueColor: '#f0f0f0',
    showSelectionLabels: true,
    // Placement of map controls.
    sliderPosition: 'bottomleft',
    infoPosition: 'topright',
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

    this.viewObj = options.viewObj;

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
    this.colorScale = chroma.scale(this.options.colorRange)
      .domain(this.valueRange)
      .classes(9);

    this.years = _.uniq(_.pluck(this.options.geoData, 'Year'));
    this.currentYear = this.years[0];

    // Track the selected GeoJSON features.
    this.selectedFeatures = [];

    // Use the ZoomShowHide library to control visibility ranges.
    this.zoomShowHide = new ZoomShowHide();

    // These variables will be set later.
    this.map = null;


    this.init();
  }

  Plugin.prototype = {

    // Is this feature selected.
    isFeatureSelected(check) {
      var ret = false;
      this.selectedFeatures.forEach(function(existing) {
        if (check._leaflet_id == existing._leaflet_id) {
          ret = true;
        }
      });
      return ret;
    },

    // Select a feature.
    selectFeature(layer) {
      // Update the data structure for selections.
      this.selectedFeatures.push(layer);
      // Pan to selection.
      this.map.panTo(layer.getBounds().getCenter());
      // Update the style.
      layer.setStyle(layer.options.sdgLayer.styleOptionsSelected);
      // Show a tooltip if necessary.
      if (this.options.showSelectionLabels) {
        var tooltipContent = layer.feature.properties[layer.options.sdgLayer.nameProperty];
        var tooltipData = this.getData(layer.feature.properties[layer.options.sdgLayer.idProperty]);
        if (tooltipData) {
          tooltipContent += ': ' + tooltipData['Value'];
        }
        layer.bindTooltip(tooltipContent, {
          permanent: true,
        }).addTo(this.map);
      }
      // Update the info pane.
      this.info.update();
      // Bring layer to front.
      if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
        layer.bringToFront();
      }
    },

    // Unselect a feature.
    unselectFeature(layer) {
      // Update the data structure for selections.
      var stillSelected = [];
      this.selectedFeatures.forEach(function(existing) {
        if (layer._leaflet_id != existing._leaflet_id) {
          stillSelected.push(existing);
        }
      });
      this.selectedFeatures = stillSelected;

      // Reset the feature's style.
      layer.setStyle(layer.options.sdgLayer.styleOptions);

      // Remove the tooltip if necessary.
      if (layer.getTooltip()) {
        layer.unbindTooltip();
      }

      // Update the info pane.
      this.info.update();
    },

    // Get all of the GeoJSON layers.
    getAllLayers: function() {
      return L.featureGroup(this.zoomShowHide.layers);
    },

    // Get only the visible GeoJSON layers.
    getVisibleLayers: function() {
      // Unfortunately relies on an internal of the ZoomShowHide library.
      return this.zoomShowHide._layerGroup;
    },

    // Update the colors of the Features on the map.
    updateColors: function() {
      var plugin = this;
      this.getAllLayers().eachLayer(function(layer) {
        layer.setStyle(function(feature) {
          return {
            fillColor: plugin.getColor(feature.properties, layer.sdgOptions.idProperty),
          }
        });
      });
    },

    // Get the local (CSV) data corresponding to a GeoJSON "feature" with the
    // corresponding data.
    getData: function(geocode) {
      var conditions = {
        GeoCode: geocode,
        Year: this.currentYear,
      }
      var matches = _.where(this.options.geoData, conditions);
      if (matches.length) {
        return matches[0];
      }
      else {
        return false;
      }
    },

    // Choose a color for a GeoJSON feature.
    getColor: function(props, idProperty) {
      var thisID = props[idProperty];
      // Otherwise return a color based on the data.
      var localData = this.getData(thisID);
      return (localData) ? this.colorScale(localData['Value']).hex() : this.options.noValueColor;
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

      // Remove zoom control on mobile.
      if (L.Browser.mobile) {
        this.map.removeControl(this.map.zoomControl);
      }

      // Add full-screen functionality.
      this.map.addControl(new L.Control.Fullscreen());

      // Add tile imagery.
      //L.tileLayer(this.options.tileURL, this.options.tileOptions).addTo(this.map);

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
        position: this.options.sliderPosition,
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
        plugin.updateColors();
        plugin.info.update();
      });

      // Helper function to round values for the legend.
      function round(value) {
        return Math.round(value * 100) / 100;
      }

      // Add the info pane.
      var info = L.control();
      info.onAdd = function() {
        this._div = L.DomUtil.create('div', 'leaflet-control info');
        this._features = L.DomUtil.create('ul', 'feature-list', this._div);
        this._legend = L.DomUtil.create('div', 'legend', this._div);
        this._legendValues = L.DomUtil.create('div', 'legend-values', this._div);
        var grades = chroma.limits(plugin.valueRange, 'e', 9).reverse();
        for (var i = 0; i < grades.length; i++) {
          this._legend.innerHTML += '<span class="info-swatch" style="background:' + plugin.colorScale(grades[i]).hex() + '"></span>';
        }
        this._legendValues.innerHTML += '<span class="legend-value left">' + plugin.valueRange[1] + '</span><span class="arrow left"></span>';
        this._legendValues.innerHTML += '<span class="legend-value right">' + plugin.valueRange[0] + '</span><span class="arrow right"></span>';

        return this._div;
      }
      info.update = function() {
        this._features.innerHTML = '';
        var pane = this;
        if (plugin.selectedFeatures.length) {
          plugin.selectedFeatures.forEach(function(layer) {
            var item = L.DomUtil.create('li', '', pane._features);
            var props = layer.feature.properties;
            var localData = plugin.getData(props[layer.options.sdgLayer.idProperty]);
            var name, value, bar;
            if (localData['Value']) {
              var fraction = (localData['Value'] - plugin.valueRange[0]) / (plugin.valueRange[1] - plugin.valueRange[0]);
              var percentage = Math.round(fraction * 100);
              name = '<span class="info-name">' + props[layer.options.sdgLayer.nameProperty] + '</span>';
              value = '<span class="info-value" style="right: ' + percentage + '%">' + localData['Value'] + '</span>';
              bar = '<span class="info-bar" style="display: inline-block; width: ' + percentage + '%"></span>';
            }
            else {
              name = '<span class="info-name info-no-value">' + props[layer.options.sdgLayer.nameProperty] + '</span>';
              value = '';
              bar = '';
            }
            item.innerHTML = bar + value + name + '<i class="info-close fa fa-remove"></i>';
            $(item).click(function(e) {
              plugin.unselectFeature(layer);
            });
            // Make sure that the value is not overlapping with the name.
            var nameWidth = $(item).find('.info-name').width();
            var barWidth = $(item).find('.info-bar').width();
            if (barWidth < nameWidth) {
              // If the bar is shorter than the name, bump out the value.
              // Adding 25 makes it come out right.
              var valueMargin = (nameWidth - barWidth) + 25;
              $(item).find('.info-value').css('margin-right', valueMargin + 'px');
            }
          });
        }
      }
      info.setPosition(this.options.infoPosition);
      info.addTo(this.map);
      this.info = info;

      // At this point we need to load the GeoJSON layer/s.
      var geoURLs = this.options.geoLayers.map(function(item) {
        return $.getJSON(item.serviceUrl);
      });
      $.when.apply($, geoURLs).done(function() {

        function onEachFeature(feature, layer) {
          layer.on({
            click: clickHandler,
          });
        }

        var geoJsons = arguments;
        for (var i in geoJsons) {
          var layer = L.geoJson(geoJsons[i], {
            // Tack on the custom options here to access them later.
            sdgLayer: plugin.options.geoLayers[i],
            style: plugin.options.geoLayers[i].styleOptions,
            onEachFeature: onEachFeature,
          });
          layer.min_zoom = plugin.options.geoLayers[i].min_zoom;
          layer.max_zoom = plugin.options.geoLayers[i].max_zoom;
          // Store our custom options here, for easier access.
          layer.sdgOptions = plugin.options.geoLayers[i];
          // Add the layer to the ZoomShowHide group.
          plugin.zoomShowHide.addLayer(layer);
        }
        plugin.updateColors();

        // Event handler for click/touch.
        function clickHandler(e) {
          var layer = e.target;
          if (plugin.isFeatureSelected(layer)) {
            plugin.unselectFeature(layer);
          }
          else {
            plugin.selectFeature(layer);
          }
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
          plugin.zoomToFeature(plugin.getVisibleLayers());
          // Limit the panning to what we care about.
          plugin.map.setMaxBounds(plugin.getVisibleLayers().getBounds());
          // Make sure the info pane is not too wide for the map.
          var $infoPane = $('.info.leaflet-control');
          var widthPadding = 20;
          var maxWidth = $('#map').width() - widthPadding;
          if ($infoPane.width() > maxWidth) {
            $infoPane.width(maxWidth);
          }
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
})(jQuery, L, chroma, window, document);

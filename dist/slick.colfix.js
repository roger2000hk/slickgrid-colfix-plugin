(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * https://github.com/keik/slickgrid-colfix-plugin
 * @version $VERSION
 * @author keik <k4t0.kei@gmail.com>
 * @license MIT
 */

// register namespace
'use strict';

$.extend(true, window, {
  Slick: {
    Plugins: {
      ColFix: ColFix
    }
  }
});

/**
 * A SlickGrid plugin to make fixed columns for horizontal scroll.
 *
 * USAGE:
 *
 * Register plugin, with one argument to specify a column ID which you want to make fixed:
 *
 *   grid.registerPlugin(new Slick.Plugins.ColFix(colId));
 *
 * ATTENTION:
 *
 *   This plugin must be registered earlier than any other plugins / event handlers registration.
 *
 * @class Slick.Plugins.ColFix
 * @param {String} fixedColId column id to make fixed column
 * @constructor
 */
function ColFix(fixedColId) {
  var _origGrid = undefined,
      _mainGrid = undefined,
      _fixedColGrid = undefined,

  // which have active cell
  _activeGrid = undefined,

  // access from scroll sync handler
  _mainViewportEl = undefined,
      _fixedColViewportEl = undefined,
      _fixedColGridUid = undefined,
      _partIndex = undefined,
      _scrollbarDim = measureScrollbar(),
      _containerBorderDim = undefined,
      _handler = new Slick.EventHandler(),
      _origEvents = {};

  var sharedHandlers = [],
      sharedPlugins = [];

  /**
   * Initialize plugin called from SlickGrid framework.
   * @param {SlickGrid} grid registered SlickGrid object
   */
  function init(grid) {
    _origGrid = grid;

    // ---------------------------------------
    // separate grid and cache
    // ---------------------------------------

    var grids = separateGrid();
    _mainGrid = grids.mainGrid;
    _mainViewportEl = _mainGrid.getContainerNode().querySelector('.slick-viewport');
    _fixedColGrid = grids.fixedColGrid;
    _fixedColViewportEl = _fixedColGrid.getContainerNode().querySelector('.slick-viewport');
    _fixedColGridUid = _fixedColGrid.getContainerNode().className.match(/(?:\s+|^)slickgrid_(\d+)(?!\w)/)[1];
    _activeGrid = _mainGrid;

    // ---------------------------------------
    // renew interface
    // ---------------------------------------

    overwriteInterfaces();

    // ---------------------------------------
    // change initialization timing
    // ---------------------------------------

    // depending on grid option `explicitInitialization`, change a timing of initialization.
    if (!_origGrid.getOptions()['explicitInitialization']) {
      _origGrid.init();
      _fixedColGrid.init();
      _mainGrid.init();

      // update with NEW `setColumns`
      _origGrid.setColumns(_origGrid.getColumns());
    } else {
      _origGrid.init = (function (originalInit) {
        return function () {
          originalInit();
          _fixedColGrid.init();
          _mainGrid.init();

          // update with NEW `setColumns`
          _origGrid.setColumns(_origGrid.getColumns());
        };
      })(_origGrid.init);
    }

    // ---------------------------------------
    // sync behavior between splited grids
    // ---------------------------------------

    // sync active cell
    _handler.subscribe(_origEvents.onActiveCellChanged, function (e, args) {
      var row = args.row,
          cell = args.cell;

      _activeGrid = cell < _partIndex ? _fixedColGrid : _mainGrid;
      _mainGrid.onActiveCellChanged.unsubscribe(onActiveCellChanged);
      _mainGrid.setActiveCell(row, _activeGrid === _mainGrid ? cell - _partIndex : 0);
      _mainGrid.onActiveCellChanged.subscribe(onActiveCellChanged);
      _fixedColGrid.onActiveCellChanged.unsubscribe(onActiveCellChanged);
      _fixedColGrid.setActiveCell(row, _activeGrid === _fixedColGrid ? cell : 0);
      _fixedColGrid.onActiveCellChanged.subscribe(onActiveCellChanged);
      var activeCellNode = (_activeGrid === _mainGrid ? _fixedColGrid : _mainGrid).getActiveCellNode();
      if (activeCellNode) activeCellNode.className = activeCellNode.className.replace(/(:?\s+|^)active(:?\s+|$)/, ' ');
    }).subscribe(_mainGrid.onActiveCellChanged, onActiveCellChanged).subscribe(_fixedColGrid.onActiveCellChanged, onActiveCellChanged);

    function onActiveCellChanged(e, args) {
      _activeGrid = args.grid;
      _origGrid.setActiveCell(args.row, _activeGrid === _mainGrid ? args.cell + _partIndex : args.cell);
    }

    // sticky scroll between each grid
    _mainGrid.onScroll.subscribe(function (e, args) {
      _fixedColViewportEl.scrollTop = args.scrollTop;
    });
    _fixedColGrid.onScroll.subscribe(function (e, args) {
      _mainViewportEl.scrollTop = args.scrollTop;
    });
  }

  /**
   * Overwrite interfaces of original SlickGrid object for abstract manipulation.
   */
  function overwriteInterfaces() {

    // share same handlers with each internal grids
    // if main grid were not initialize yet, handlers would be cached in `sharedHandlers` and set after initialization.
    Object.keys(_origGrid).filter(function (key) {
      return key.match(/^on/);
    }).forEach(function (handlerName) {
      _origEvents[handlerName] = new Slick.Event();
      _origEvents[handlerName].subscribe = _origGrid[handlerName].subscribe;
      _origGrid[handlerName].subscribe = function (handler) {
        if (_mainGrid && _fixedColGrid) {
          _fixedColGrid[handlerName].subscribe(handler);
          _mainGrid[handlerName].subscribe(handler);
        } else {
          sharedHandlers.push({ handlerName: handlerName, handler: handler });
        }
      };
    });

    // share same plugins with each internal grids
    // if main grid were not initialize yet, plugins would be cached in `sharedPlugins` and set after initialization.
    _origGrid.registerPlugin = function (plugin) {
      if (_mainGrid && _fixedColGrid) {
        _fixedColGrid.registerPlugin(plugin);
        _mainGrid.registerPlugin(plugin);
      } else {
        sharedPlugins.push(plugin);
      }
    };

    _origGrid.destroy = (function (origFn) {
      return function () {
        // restore original structure
        var origContainerNode = _origGrid.getContainerNode();
        var wrapper = _origGrid.getContainerNode().parentNode;
        origContainerNode.id = wrapper.id;
        origContainerNode.style.display = '';
        wrapper.parentNode.replaceChild(origContainerNode, wrapper);

        // destroy all grids
        origFn();
        _fixedColGrid.destroy();
        _mainGrid.destroy();
      };
    })(_origGrid.destroy);

    ['invalidate', 'invalidateRow', 'invalidateRows', 'invalidateAllRows', 'render', 'updateRow', 'updateRowCount'].forEach(function (fnName) {
      _origGrid[fnName] = (function (origFn) {
        return function () {
          origFn.apply(_origGrid, arguments);
          _fixedColGrid[fnName].apply(_fixedColGrid, arguments);
          _mainGrid[fnName].apply(_fixedColGrid, arguments);
        };
      })(_origGrid[fnName]);
    });

    _origGrid.getHeaderRow = function () {
      return [_fixedColGrid.getHeaderRow(), _mainGrid.getHeaderRow()];
    };

    _origGrid.getCellFromEvent = function () {
      var tmp = _fixedColGrid.getCellFromEvent.apply(_fixedColGrid, arguments);
      if (!tmp) {
        tmp = _mainGrid.getCellFromEvent.apply(_fixedColGrid, arguments);
        tmp.cell += _partIndex;
      }
      return tmp;
    };

    _origGrid.editActiveCell = function () {
      (_origGrid.getActiveCell().cell < _partIndex ? _fixedColGrid : _mainGrid).editActiveCell();
    };

    _origGrid.setColumns = setColumns;
  }

  /**
   * Restructure DOM tree and separate a original SlickGrid object to new two SlickGrid objects,
   * which one have fixed column and another one have rest of columns.
   * @param {SlickGrid} grid Base SlickGrid object
   * @return {Object.<SlickGrid, SlickGrid>} fixed column grid and main grid
   */
  function separateGrid() {

    /*
     * transform DOM structrure from:
     *
     *   <div/><!-- origContainerNode -->
     *
     * to:
     *
     *   <div><!--wrapper -->
     *    <div style="display: none"/><!-- origContainerNode -->
     *    <div><!-- innerWrapper -->
     *      <div/><!-- fixedColContainer -->
     *    </div>
     *    <div/><!-- mainContainerNode -->
     *    <div/><!-- clearfix -->
     *   </div>
     */
    var wrapper = document.createElement('div'),
        innerWrapper = document.createElement('div'),
        origContainerNode = _origGrid.getContainerNode(),
        mainContainerNode = document.createElement('div'),
        fixedColContainer = document.createElement('div'),
        clearfix = document.createElement('div');

    // style
    var computed = window.getComputedStyle(origContainerNode);
    if (computed.boxSizing === 'border-box') {
      _containerBorderDim = {
        top: parseInt(computed.borderTopWidth, 10),
        right: parseInt(computed.borderRightWidth, 10),
        bottom: parseInt(computed.borderBottomWidth, 10),
        left: parseInt(computed.borderLeftWidth, 10)
      };
    } else {
      _containerBorderDim = {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0
      };
    }

    wrapper.style.width = computed['width'];
    innerWrapper.style.float = 'left';
    fixedColContainer.style.height = computed['height'];
    mainContainerNode.style.height = computed['height'];
    clearfix.style.clear = 'both';

    // unset orig props
    origContainerNode.style.display = 'none';
    origContainerNode.className = origContainerNode.className.replace(/(?:\s+|^)slickgrid_\d+(?:\s+|$)/, ' ');

    // copy orig props to new wrapper and containers
    wrapper.id = origContainerNode.id;
    origContainerNode.id = '';
    fixedColContainer.className += origContainerNode.className;
    mainContainerNode.className += origContainerNode.className;

    // structure DOM
    origContainerNode.parentNode.replaceChild(wrapper, origContainerNode);
    wrapper.appendChild(origContainerNode);
    wrapper.appendChild(innerWrapper);
    innerWrapper.appendChild(fixedColContainer);
    wrapper.appendChild(mainContainerNode);
    wrapper.appendChild(clearfix);

    // instantiate
    var fixedColGrid = new Slick.Grid(fixedColContainer, _origGrid.getData(), [], _origGrid.getOptions());
    var mainGrid = new Slick.Grid(mainContainerNode, _origGrid.getData(), [], _origGrid.getOptions());

    [fixedColGrid, mainGrid].forEach(function (grid) {
      sharedHandlers.forEach(function (sharedHandler) {
        grid[sharedHandler.handlerName].subscribe(sharedHandler.handler);
      });
      sharedPlugins.forEach(function (plugin) {
        grid.registerPlugin(plugin);
      });
    });

    return { fixedColGrid: fixedColGrid, mainGrid: mainGrid };
  }

  /**
   * Set columns defination.
   * A args `columnDef` would be separated and applied to each grids (main and fixed-grid).
   * @param {Array.<Object>} columnsDef columns definations
   */
  function setColumns(columnsDef) {
    var fixedColumns = [],
        unfixedColumns = [],
        i = 0,
        len = columnsDef.length;

    _partIndex = 0;

    for (; i < len; i++) {
      var col = columnsDef[i];
      if (col.id === fixedColId) {
        _partIndex = i + 1;
        break;
      }
    }

    fixedColumns = columnsDef.slice(0, _partIndex);
    fixedColumns.forEach(function (item, idx) {
      if (idx < _partIndex) {
        item.resizable = false;
      }
    });

    unfixedColumns = columnsDef.slice(_partIndex);

    // update each grid columns defination
    _fixedColGrid.setColumns(fixedColumns);
    applyFixedColGridWidth();
    _mainGrid.setColumns(unfixedColumns);
  }

  /**
   * Apply width of fixed-columns grid.
   */
  function applyFixedColGridWidth() {
    var fixedColContainerEl = _fixedColGrid.getContainerNode(),
        innerWrapper = fixedColContainerEl.parentNode,
        fixedColGridWidth = 0,
        headersSelector = _fixedColGrid.getColumns().map(function (c) {
      return '#slickgrid_' + _fixedColGridUid + String(c.id).replace(/(#|,|\.)/g, '\\$1');
    }).join(','),
        headers = headersSelector ? fixedColContainerEl.querySelectorAll(headersSelector) : [];

    for (var i = 0, len = headers.length; i < len; i++) {
      fixedColGridWidth += headers[i].offsetWidth;
    }

    innerWrapper.style.width = fixedColGridWidth + 'px';
    fixedColContainerEl.style.width = fixedColGridWidth + _scrollbarDim.width + _containerBorderDim.left + _containerBorderDim.right + 'px';
  }

  /**
   * Measure scroll bar width and height. (Copied from original slick.grid.js)
   * @return {Object.<number, number>} width and height;
   */
  function measureScrollbar() {
    var $c = $('<div style="position:absolute; top:-10000px; left:-10000px; width:100px; height:100px; overflow:scroll;"></div>').appendTo('body');
    var dim = {
      width: $c.width() - $c[0].clientWidth,
      height: $c.height() - $c[0].clientHeight
    };
    $c.remove();
    return dim;
  }

  $.extend(this, {
    init: init
  });
}

},{}]},{},[1]);

'use strict';

var keypather = require('keypather')();
var util = require('util');
var find = require('101/find');
var BaseStore = require('./base-store');
var Container = require('./container');
var Promise = require('bluebird');

module.exports = ContainerStore;

function ContainerStore () {
  BaseStore.call(this);
}
util.inherits(ContainerStore, BaseStore);

ContainerStore.prototype.findOneByName = function (name) {
  return Promise.resolve()
    .bind(this)
    .then(function () {
      var foundId = find(
        Object.keys(this._store),
        function (storeId) {
          return this._store[storeId].name === name;
        }.bind(this));
      if (!foundId) {
        throw new BaseStore.NotFoundError('Container not found');
      }
      return this._store[foundId];
    });
};

ContainerStore.prototype.findOneByIdOrName = function (id) {
  return Promise.any([
    this.findOneByName(id),
    this.findOneById(id)
  ]);
};

ContainerStore.prototype.deleteById = function (id) {
  return this.findOneByIdOrName(id)
    .bind(this)
    .then(function (container) {
      delete this._store[container.Id];
      return container;
    })
    .then(function (container) {
      this.emit('event', 'destroy', container);
      return container;
    })
    .then(function (container) {
      container.removeAllListeners('event');
      return container;
    });
};

ContainerStore.prototype.listContainers = function (filters) {
  filters = filters || {};
  return Promise.resolve()
    .bind(this)
    .then(function () {
      return Object.keys(this._store).map(function (storeId) {
        var container = this._store[storeId];
        return {
          Id: container.Id,
          Image: container.Image,
          Created: container.Created,
          Labels: keypather.get(container, 'Config.Labels'),
          State: container.State
          // TODO: extend with other data we may want
        };
      }.bind(this));
    })
    .then(function (containers) {
      Object.keys(filters).forEach(function (filter) {
        switch (filter) {
        case 'label':
          var key = Object.keys(filters[filter])[0];
          var value = filters[filter][key];
          containers = containers.filter(filterLabel(key, value));
          break;
        case 'status':
          var running = filters[filter] === 'running';
          containers = containers.filter(filterStatus(running));
          break;
        }
      });
      return containers;
    });

  function filterLabel (key, value) {
    return function (c) {
      if (!c.Labels) { return false; }
      var containerValue = c.Labels[key];
      if (!containerValue || containerValue !== value) { return false; }
      return true;
    };
  }
  function filterStatus (status) {
    return function (c) { return c.State.Running === status; };
  }
};

ContainerStore.prototype.createContainer = function (body) {
  return Promise.resolve()
    .bind(this)
    .then(function () {
      var container = new Container(body);
      this._store[container.Id] = container;
      return container;
    })
    .then(function (container) {
      container.on('event', function () {
        var args = Array.prototype.slice.call(arguments);
        args.unshift('event');
        this.emit.apply(this, args);
      }.bind(this));
      return container;
    })
    .then(function (container) {
      this.emit('event', 'create', container);
      return container;
    });
};

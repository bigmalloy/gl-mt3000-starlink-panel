module.exports = (function () {
  'use strict';

  function fmtSpeed(bps) {
    bps = Number(bps) || 0;
    if (bps >= 1e6) return (bps / 1e6).toFixed(2) + ' Mbps';
    if (bps >= 1e3) return (bps / 1e3).toFixed(1) + ' Kbps';
    return bps.toFixed(0) + ' bps';
  }

  function fmtUptime(s) {
    s = Math.floor(Number(s) || 0);
    var d = Math.floor(s / 86400);
    var h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (d > 0) return d + 'd ' + h + 'h ' + m + 'm';
    if (h > 0) return h + 'h ' + m + 'm';
    return m + 'm ' + sec + 's';
  }

  function fmtPct(v) {
    return (Number(v) * 100).toFixed(2) + '%';
  }

  function fmtDeg(v) {
    return (Number(v) || 0).toFixed(1) + '°';
  }

  var CARD = {
    background: '#fff',
    borderRadius: '8px',
    padding: '16px 20px',
    marginBottom: '16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)'
  };

  var LABEL = {
    color: '#999',
    fontSize: '12px',
    marginBottom: '2px'
  };

  var VALUE = {
    fontSize: '15px',
    fontWeight: '500',
    color: '#333'
  };

  function row(h, label, value, valueStyle) {
    return h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f5f5f5' } }, [
      h('span', { style: { color: '#666', fontSize: '13px' } }, label),
      h('span', { style: Object.assign({ fontSize: '13px', fontWeight: '500' }, valueStyle || {}) }, value)
    ]);
  }

  function cardSection(h, title, rows) {
    return h('div', { style: CARD }, [
      h('div', { style: { fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '8px', paddingBottom: '8px', borderBottom: '2px solid #f0f0f0' } }, title),
      h('div', {}, rows)
    ]);
  }

  return {
    name: 'StarlinkView',

    data: function () {
      return {
        dish: null,
        loading: true,
        error: null,
        timer: null,
        lastUpdated: null,
        rebooting: false,
        rebootMsg: null
      };
    },

    created: function () {
      this.fetchData();
      this.timer = setInterval(this.fetchData, 5000);
    },

    beforeDestroy: function () {
      if (this.timer) clearInterval(this.timer);
    },

    methods: {
      rebootDish: function () {
        if (!window.confirm('Reboot the Starlink dish?')) return;
        var self = this;
        self.rebooting = true;
        self.rebootMsg = null;
        window.$rpcRequest('call', ['sid', 'starlink', 'reboot_dish', {}])
          .then(function (data) {
            self.rebooting = false;
            self.rebootMsg = (data && data.success) ? 'Reboot command sent.' : 'Reboot failed: ' + (data && data.error || 'unknown error');
          })
          .catch(function (e) {
            self.rebooting = false;
            self.rebootMsg = 'Error: ' + String(e && e.message ? e.message : e);
          });
      },

      fetchData: function () {
        var self = this;
        window.$rpcRequest('call', ['sid', 'starlink', 'dish', {}])
          .then(function (data) {
            self.dish = data;
            self.loading = false;
            self.error = null;
            self.lastUpdated = new Date().toLocaleTimeString();
          })
          .catch(function (e) {
            self.error = String(e && e.message ? e.message : e) || 'Request failed';
            self.loading = false;
          });
      }
    },

    render: function (h) {
      var self = this;

      // Loading state
      if (self.loading) {
        return h('div', { style: { padding: '40px', textAlign: 'center', color: '#999' } }, 'Loading Starlink data…');
      }

      // Error state
      if (self.error) {
        return h('div', { style: { padding: '40px', textAlign: 'center', color: '#f56c6c' } }, 'Error: ' + self.error);
      }

      var d = self.dish || {};
      var connected = d.state === 'CONNECTED';
      var stateColor = connected ? '#67c23a' : '#f56c6c';

      var header = h('div', { style: Object.assign({}, CARD, { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }) }, [
        h('div', {}, [
          h('div', { style: { fontSize: '18px', fontWeight: '600', color: '#333' } }, 'Starlink Dish'),
          h('div', { style: { fontSize: '12px', color: '#999', marginTop: '4px' } }, d.dish_id || ''),
        ]),
        h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' } }, [
          h('span', {
            style: {
              display: 'inline-block',
              padding: '4px 14px',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: '600',
              background: connected ? '#f0f9eb' : '#fef0f0',
              color: stateColor,
              border: '1px solid ' + stateColor
            }
          }, d.state || 'UNKNOWN'),
          self.lastUpdated ? h('span', { style: { fontSize: '11px', color: '#bbb' } }, 'Updated ' + self.lastUpdated) : null,
          h('button', {
            style: {
              marginTop: '6px',
              padding: '4px 12px',
              fontSize: '12px',
              borderRadius: '4px',
              border: '1px solid #f56c6c',
              background: self.rebooting ? '#fef0f0' : '#fff',
              color: '#f56c6c',
              cursor: self.rebooting ? 'not-allowed' : 'pointer'
            },
            attrs: { disabled: self.rebooting },
            on: { click: self.rebootDish }
          }, self.rebooting ? 'Rebooting…' : 'Reboot dish')
        ])
      ]);

      var dropRate = Number(d.drop_rate) || 0;
      var speedCard = cardSection(h, 'Performance', [
        row(h, 'Download', fmtSpeed(d.downlink_bps), { color: '#409eff' }),
        row(h, 'Upload', fmtSpeed(d.uplink_bps), { color: '#67c23a' }),
        row(h, 'Latency', (Number(d.latency_ms) || 0).toFixed(1) + ' ms'),
        row(h, 'Drop rate', fmtPct(d.drop_rate),
          { color: dropRate > 0.01 ? '#f56c6c' : dropRate > 0.001 ? '#e6a23c' : '#67c23a' }),
        row(h, 'Uptime', fmtUptime(d.uptime)),
        row(h, 'Ethernet', (d.eth_speed_mbps || '—') + (d.eth_speed_mbps ? ' Mbps' : ''))
      ]);

      var dlRestrict = d.dl_restrict || 'NOT_BANDWIDTH_LIMITED';
      var ulRestrict = d.ul_restrict || 'NOT_BANDWIDTH_LIMITED';
      var dlLimited = dlRestrict !== 'NOT_BANDWIDTH_LIMITED';
      var ulLimited = ulRestrict !== 'NOT_BANDWIDTH_LIMITED';

      var signalCard = cardSection(h, 'Signal & Obstruction', [
        row(h, 'SNR',
          d.snr_above_noise === 'true' ? 'Above noise floor' : 'Low',
          { color: d.snr_above_noise === 'true' ? '#67c23a' : '#e6a23c' }),
        row(h, 'SNR persistently low',
          d.snr_persistently_low === 'true' ? 'Yes' : 'No',
          { color: d.snr_persistently_low === 'true' ? '#f56c6c' : '#67c23a' }),
        row(h, 'Obstruction',
          fmtPct(d.fraction_obstructed),
          { color: Number(d.fraction_obstructed) > 0.01 ? '#e6a23c' : '#67c23a' }),
        row(h, 'Currently obstructed',
          d.currently_obstructed === 'true' ? 'Yes' : 'No',
          { color: d.currently_obstructed === 'true' ? '#f56c6c' : '#67c23a' }),
        row(h, 'GPS satellites', String(d.gps_sats || '—')),
        row(h, 'GPS valid', d.gps_valid === 'true' ? 'Yes' : 'No',
          { color: d.gps_valid === 'true' ? '#67c23a' : '#e6a23c' }),
        row(h, 'DL restricted', dlLimited ? dlRestrict.replace(/_/g, ' ') : 'No',
          { color: dlLimited ? '#e6a23c' : '#67c23a' }),
        row(h, 'UL restricted', ulLimited ? ulRestrict.replace(/_/g, ' ') : 'No',
          { color: ulLimited ? '#e6a23c' : '#67c23a' }),
        row(h, 'Disablement', d.disablement || '—',
          { color: d.disablement === 'OKAY' ? '#67c23a' : '#e6a23c' })
      ]);

      var alignCard = cardSection(h, 'Antenna Alignment', [
        row(h, 'Tilt angle', fmtDeg(d.tilt_angle_deg),
          { color: Number(d.tilt_angle_deg) > 5 ? '#e6a23c' : '#333' }),
        row(h, 'Boresight elevation', fmtDeg(d.bore_elevation_deg)),
        row(h, 'Desired elevation', fmtDeg(d.desired_elevation_deg)),
        row(h, 'Boresight azimuth', fmtDeg(d.bore_azimuth_deg)),
        row(h, 'Desired azimuth', fmtDeg(d.desired_azimuth_deg)),
        row(h, 'Attitude uncertainty', fmtDeg(d.attitude_uncertainty_deg)),
        row(h, 'Attitude state', (d.attitude || '—').replace(/_/g, ' '))
      ]);

      var swUpdateState = d.sw_update_state || '—';
      var infoCard = cardSection(h, 'Device Info', [
        row(h, 'Hardware', d.hardware || '—'),
        row(h, 'Software', d.software || '—'),
        row(h, 'SW update', swUpdateState.replace(/_/g, ' '),
          { color: swUpdateState === 'IDLE' ? '#67c23a' : '#e6a23c' }),
        row(h, 'Country', d.country_code || '—'),
        row(h, 'Boot count', String(d.bootcount || '—')),
        row(h, 'Snow melt', (d.snow_melt_mode || '—').replace(/_/g, ' ')),
        row(h, 'Mobility', (d.mobility_class || '—').replace(/_/g, ' '))
      ]);

      var alertKeys = ['al_heating','al_mast','al_motors','al_psu_throttle','al_roaming',
        'al_shutdown','al_slow_eth','al_throttle','al_unexpected_location','al_install_pending'];
      var activeAlerts = alertKeys.filter(function(k) { return d[k] === 'true'; });

      var alertCard = cardSection(h, 'Alerts', activeAlerts.length === 0
        ? [row(h, 'Status', 'No active alerts', { color: '#67c23a' })]
        : activeAlerts.map(function(k) {
            return row(h, k.replace(/^al_/, '').replace(/_/g, ' '), 'ACTIVE', { color: '#f56c6c' });
          })
      );

      var rebootBanner = self.rebootMsg ? h('div', {
        style: {
          padding: '10px 16px',
          marginBottom: '16px',
          borderRadius: '6px',
          fontSize: '13px',
          background: self.rebootMsg.startsWith('Reboot command') ? '#f0f9eb' : '#fef0f0',
          color: self.rebootMsg.startsWith('Reboot command') ? '#67c23a' : '#f56c6c',
          border: '1px solid ' + (self.rebootMsg.startsWith('Reboot command') ? '#67c23a' : '#f56c6c')
        }
      }, self.rebootMsg) : null;

      return h('div', { style: { padding: '16px', maxWidth: '720px', margin: '0 auto' } }, [
        header,
        rebootBanner,
        speedCard,
        signalCard,
        alignCard,
        infoCard,
        alertCard,
        h('div', { style: { textAlign: 'center', fontSize: '11px', color: '#ccc', marginTop: '8px' } },
          'Auto-refreshes every 5s · Last updated: ' + (self.lastUpdated || '—'))
      ]);
    }
  };
})()

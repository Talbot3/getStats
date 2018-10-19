'use strict';

// Last time updated: 2018-10-19 3:38:33 AM UTC

// _______________
// getStats v1.0.10

// Open-Sourced: https://github.com/muaz-khan/getStats

// --------------------------------------------------
// Muaz Khan     - www.MuazKhan.com
// MIT License   - www.WebRTC-Experiment.com/licence
// --------------------------------------------------

window.getStats = function(mediaStreamTrack, callback, interval) {

    var RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;

    if (typeof MediaStreamTrack === 'undefined') {
        MediaStreamTrack = {}; // todo?
    }

    var systemNetworkType = ((navigator.connection || {}).type || 'unknown').toString().toLowerCase();

    var getStatsResult = {
        encryption: 'sha-256',
        audio: {
            send: {
                tracks: [],
                codecs: [],
                availableBandwidth: 0,
                streams: 0
            },
            recv: {
                tracks: [],
                codecs: [],
                availableBandwidth: 0,
                streams: 0
            },
            bytesSent: 0,
            bytesReceived: 0
        },
        video: {
            send: {
                tracks: [],
                codecs: [],
                availableBandwidth: 0,
                streams: 0
            },
            recv: {
                tracks: [],
                codecs: [],
                availableBandwidth: 0,
                streams: 0
            },
            bytesSent: 0,
            bytesReceived: 0
        },
        bandwidth: {
            systemBandwidth: 0,
            sentPerSecond: 0,
            encodedPerSecond: 0,
            helper: {
                audioBytesSent: 0,
                videoBytestSent: 0
            },
            speed: 0
        },
        results: {},
        connectionType: {
            systemNetworkType: systemNetworkType,
            systemIpAddress: '192.168.1.2',
            local: {
                candidateType: [],
                transport: [],
                ipAddress: [],
                networkType: []
            },
            remote: {
                candidateType: [],
                transport: [],
                ipAddress: [],
                networkType: []
            }
        },
        resolutions: {
            send: {
                width: 0,
                height: 0
            },
            recv: {
                width: 0,
                height: 0
            }
        },
        internal: {
            audio: {
                send: {},
                recv: {}
            },
            video: {
                send: {},
                recv: {}
            },
            candidates: {}
        },
        nomore: function() {
            nomore = true;
        }
    };

    var getStatsParser = {
        checkIfOfferer: function(result) {
            if (result.type === 'googLibjingleSession') {
                getStatsResult.isOfferer = result.googInitiator;
            }
        }
    };

    function preHandler(result) {
        // 根据codeId\trackId映射 - 处理关联关系
        var idMap = result.reduce(function(map, item) {
            if (item.type != 'codec' && item.type != 'track' && item.type != 'transport') return map;
            map[item.id] = item;
            return map;
        }, {});
        // 若与原有字段有冲突，则在其他代码中做值检测，并用其他字段进行判断。例如sendrecvType
        return result.reduce(function(sum, item) {
            // 兼容candidate相关参数 - 处理字段兼容，转义
            if (item.type.indexof('candidate') >= 0) {
                if (item.ip) {
                    item.ipAddress = item.ip;
                }
                if (item.protocol) {
                    item.googTransportType = item.protocol;
                }
                if (item.state) {
                    item.googActiveConnection = item.state == 'succeeded';
                }
                if (item.port) {
                    item.portNumber = item.port;
                }
            };
            if (item.type != 'outbound-rtp' && item.type != 'inbound-rtp' && item.type.indexof('candidate') < 0) {
                sum.push(item);
                return sum;
            }
            item = Object.assign(item, idMap[item.transportId], idMap[item.codecId], idMap[item.trackId]);
            if (item.mimeType) {
                item.googCodecName = item.mimeType.split('/')[1];
            }
            sum.push(item);
            return sum;
        }, []);
    }

    var peer = this;

    if (typeof arguments[0].getStats === 'function') {
        peer = arguments[0];

        if (!!navigator.mozGetUserMedia) {
            mediaStreamTrack = arguments[1];
            callback = arguments[2];
            interval = arguments[3];
        }
    } else {
        throw '1st argument is not exit getStats function';
    }

    if (arguments[0] instanceof RTCPeerConnection) {
        if (!!navigator.mozGetUserMedia && !(mediaStreamTrack instanceof MediaStreamTrack)) {
            console.warn('2nd argument is not instance of MediaStreamTrack.');
        }
    } else if (!!navigator.mozGetUserMedia && !(mediaStreamTrack instanceof MediaStreamTrack)) {
        console.warn('1st argument is not instance of MediaStreamTrack.');
    }

    var nomore = false;

    function getStatsLooper() {
        getStatsWrapper(function(results) {
            results.forEach(function(result) {
                Object.keys(getStatsParser).forEach(function(key) {
                    if (typeof getStatsParser[key] === 'function') {
                        // dispatch item to all handler,just like router,
                        // but if need map, you show pre handle and write to result.internal[key] = map;
                        getStatsParser[key](result);
                    }
                });

                if (result.type !== 'local-candidate' && result.type !== 'remote-candidate' && result.type !== 'candidate-pair') {
                    // console.error('result', result);
                }
            });

            try {
                // failed|closed
                if (peer.iceConnectionState.search(/failed/gi) !== -1) {
                    nomore = true;
                }
            } catch (e) {
                nomore = true;
            }

            if (nomore === true) {
                if (getStatsResult.datachannel) {
                    getStatsResult.datachannel.state = 'close';
                }
                getStatsResult.ended = true;
            }

            // allow users to access native results
            getStatsResult.results = results;

            if (getStatsResult.audio && getStatsResult.video) {
                getStatsResult.bandwidth.speed = (getStatsResult.audio.bytesSent - getStatsResult.bandwidth.helper.audioBytesSent) + (getStatsResult.video.bytesSent - getStatsResult.bandwidth.helper.videoBytesSent);
                getStatsResult.bandwidth.helper.audioBytesSent = getStatsResult.audio.bytesSent;
                getStatsResult.bandwidth.helper.videoBytesSent = getStatsResult.video.bytesSent;
            }
            callback(getStatsResult);
            // second argument checks to see, if target-user is still connected.
            if (!nomore) {
                typeof interval != undefined && interval && setTimeout(getStatsLooper, interval || 1000);
            }
        });
    }

    // a wrapper around getStats which hides the differences (where possible)
    // following code-snippet is taken from somewhere on the github
    function getStatsWrapper(cb) {
        if (!peer || peer.signalingState == 'closed') return;

        if (typeof window.InstallTrigger !== 'undefined') {
            peer.getStats(
                mediaStreamTrack,
                function(res) {
                    var items = [];
                    res.forEach(function(r) {
                        items.push(r);
                    });
                    cb(items);
                },
                cb
            );
        } else {
            // 注意点，peer.getStats仅支持callback方法调用。
            peer.getStats(function(res) {
                var items = [];
                var result = res.result();
                console.dir(result);
                result.forEach(function(res) {
                    var item = {};
                    var names = null;
                    try {
                        // 用于统计信息的地方，如果JsBridge没有Mock,统计将无法生效
                        names = res.names();
                        names.forEach(function(name) {
                            item[name] = res.stat(name);
                        });
                    } catch (error) {
                        item = Object.assign(item, res);
                    }
                    item.id = res.id;
                    item.type = res.type;
                    item.timestamp = res.timestamp;
                    items.push(item);
                });
                console.log('items', items);
                var items = preHandler(items);
                cb(items);
            });
        }
    };

    getStatsParser.datachannel = function(result) {
        if (result.type !== 'datachannel') return;

        getStatsResult.datachannel = {
            state: result.state // open or connecting
        }
    };

    getStatsParser.googCertificate = function(result) {
        if (result.type == 'googCertificate') {
            getStatsResult.encryption = result.googFingerprintAlgorithm;
        }
    };

    var AUDIO_codecs = ['opus', 'isac', 'ilbc'];

    getStatsParser.checkAudioTracks = function(result) {
        if (!result.googCodecName || result.mediaType !== 'audio') return;

        if (AUDIO_codecs.indexOf(result.googCodecName.toLowerCase()) === -1) return;

        var sendrecvType = result.id.split('_').pop();
        // check sendrecvType
        if (sendrecvType != 'recv' && sendrecvType != 'send') {
            sendrecvType = result.isRemote ? 'recv' : 'send';
        }
        if (getStatsResult.audio[sendrecvType].codecs.indexOf(result.googCodecName) === -1) {
            getStatsResult.audio[sendrecvType].codecs.push(result.googCodecName);
        }

        if (result.bytesSent) {
            var kilobytes = 0;
            if (!!result.bytesSent) {
                if (!getStatsResult.internal.audio[sendrecvType].prevBytesSent) {
                    getStatsResult.internal.audio[sendrecvType].prevBytesSent = result.bytesSent;
                }

                var bytes = result.bytesSent - getStatsResult.internal.audio[sendrecvType].prevBytesSent;
                getStatsResult.internal.audio[sendrecvType].prevBytesSent = result.bytesSent;

                kilobytes = bytes / 1024;
            }

            getStatsResult.audio[sendrecvType].availableBandwidth = kilobytes.toFixed(1);
        }

        if (result.bytesReceived) {
            var kilobytes = 0;
            if (!!result.bytesReceived) {
                if (!getStatsResult.internal.audio[sendrecvType].prevBytesReceived) {
                    getStatsResult.internal.audio[sendrecvType].prevBytesReceived = result.bytesReceived;
                }

                var bytes = result.bytesReceived - getStatsResult.internal.audio[sendrecvType].prevBytesReceived;
                getStatsResult.internal.audio[sendrecvType].prevBytesReceived = result.bytesReceived;

                kilobytes = bytes / 1024;
            }

            getStatsResult.audio[sendrecvType].availableBandwidth = kilobytes.toFixed(1);
        }

        if (getStatsResult.audio[sendrecvType].tracks.indexOf(result.googTrackId) === -1) {
            getStatsResult.audio[sendrecvType].tracks.push(result.googTrackId);
        }
    };

    var VIDEO_codecs = ['vp9', 'vp8', 'h264'];

    getStatsParser.checkVideoTracks = function(result) {
        if (!result.googCodecName || result.mediaType !== 'video') return;

        if (VIDEO_codecs.indexOf(result.googCodecName.toLowerCase()) === -1) return;

        // googCurrentDelayMs, googRenderDelayMs, googTargetDelayMs
        // transportId === 'Channel-audio-1'
        var sendrecvType = result.id.split('_').pop();
        // check sendrecvType
        if (sendrecvType != 'recv' && sendrecvType != 'send') {
            sendrecvType = result.isRemote ? 'recv' : 'send';
        }
        if (getStatsResult.video[sendrecvType].codecs.indexOf(result.googCodecName) === -1) {
            getStatsResult.video[sendrecvType].codecs.push(result.googCodecName);
        }

        if (!!result.bytesSent) {
            var kilobytes = 0;
            // 若刷新呀SDP重新交换，需要重新计算
            if (!getStatsResult.internal.video[sendrecvType].prevBytesSent || getStatsResult.internal.video[sendrecvType].prevBytesSent > result.bytesSent) {
                getStatsResult.internal.video[sendrecvType].prevBytesSent = result.bytesSent;
            }

            var bytes = result.bytesSent - getStatsResult.internal.video[sendrecvType].prevBytesSent;
            getStatsResult.internal.video[sendrecvType].prevBytesSent = result.bytesSent;

            kilobytes = bytes / 1024;
        }

        if (!!result.bytesReceived) {
            var kilobytes = 0;
            if (!getStatsResult.internal.video[sendrecvType].prevBytesReceived || getStatsResult.internal.video[sendrecvType].prevBytesReceived > result.bytesReceived) {
                getStatsResult.internal.video[sendrecvType].prevBytesReceived = result.bytesReceived;
            }

            var bytes = result.bytesReceived - getStatsResult.internal.video[sendrecvType].prevBytesReceived;
            getStatsResult.internal.video[sendrecvType].prevBytesReceived = result.bytesReceived;

            kilobytes = bytes / 1024;
        }

        getStatsResult.video[sendrecvType].availableBandwidth = kilobytes.toFixed(1);

        if (!!result.packetsLost) {
            var kilolostPackets = 0;

            if (!getStatsResult.internal.video[sendrecvType].prevLostPacket) {
                getStatsResult.internal.video[sendrecvType].prevLostPacket = result.packetsLost;
            }

            var packets = result.packetsLost - getStatsResult.internal.video[sendrecvType].prevLostPacket;
            kilolostPackets = packets / 1024;
            getStatsResult.video[sendrecvType].packetsLostRate = kilobytes != 0 ? Math.round((kilolostPackets / kilobytes) * 100) / 100 + "%" : '0.00%';
        }
        if (result.googFrameHeightReceived && result.googFrameWidthReceived) {
            getStatsResult.resolutions[sendrecvType].width = result.googFrameWidthReceived;
            getStatsResult.resolutions[sendrecvType].height = result.googFrameHeightReceived;
        }

        if (result.googFrameHeightSent && result.googFrameWidthSent) {
            getStatsResult.resolutions[sendrecvType].width = result.googFrameWidthSent;
            getStatsResult.resolutions[sendrecvType].height = result.googFrameHeightSent;
        }

        if (getStatsResult.video[sendrecvType].tracks.indexOf(result.googTrackId) === -1) {
            getStatsResult.video[sendrecvType].tracks.push(result.googTrackId);
        }
    };

    getStatsParser.bweforvideo = function(result) {
        if (result.type !== 'VideoBwe' && result.type !== "candidate-pair") return;
        getStatsResult.bandwidth.availableSendBandwidth = result.googAvailableSendBandwidth || result.availableOutgoingBitrate || 0;
        getStatsResult.bandwidth.googActualEncBitrate = result.googActualEncBitrate;
        getStatsResult.bandwidth.googAvailableSendBandwidth = result.googAvailableSendBandwidth || result.availableOutgoingBitrate || 0;
        getStatsResult.bandwidth.googAvailableReceiveBandwidth = result.googAvailableReceiveBandwidth || result.availableIncomingBitrate || 0;
        getStatsResult.bandwidth.googRetransmitBitrate = result.googRetransmitBitrate;
        getStatsResult.bandwidth.googTargetEncBitrate = result.googTargetEncBitrate;
        getStatsResult.bandwidth.googBucketDelay = result.googBucketDelay;
        // 实际传输的比特率
        getStatsResult.bandwidth.googTransmitBitrate = result.googTransmitBitrate || 0;
    };

    getStatsParser.candidatePair = function(result) {
        if (result.type !== 'googCandidatePair' && result.type !== 'candidate-pair') return;

        // result.googActiveConnection means either STUN or TURN is used.

        if (result.googActiveConnection == 'true') {
            // id === 'Conn-audio-1-0'
            // localCandidateId, remoteCandidateId

            // 实际传输的比特率 bytesSent, bytesReceived - 标准的getStats不支持VideoBwe
            if (result.bytesSent) {
                var kilobytes = 0;
                if (!!getStatsResult.internal.preCandidateBytesSent) {
                    getStatsResult.internal.preCandidateBytesSent = result.bytesSent;
                }
                var bytes = result.bytesSent - getStatsResult.internal.preCandidateBytesSent;
                getStatsResult.internal.preCandidateBytesSent = result.bytesSent;
                kilobytes = bytes / 1024;
                getStatsResult.bandwidth.candidateTransmitBitrate = kilobytes;
            }
            Object.keys(getStatsResult.internal.candidates).forEach(function(cid) {
                var candidate = getStatsResult.internal.candidates[cid];
                if (candidate.ipAddress.indexOf(result.googLocalAddress) !== -1) {
                    getStatsResult.connectionType.local.candidateType = candidate.candidateType;
                    getStatsResult.connectionType.local.ipAddress = candidate.ipAddress;
                    getStatsResult.connectionType.local.networkType = candidate.networkType;
                    getStatsResult.connectionType.local.transport = candidate.transport;
                }
                if (candidate.ipAddress.indexOf(result.googRemoteAddress) !== -1) {
                    getStatsResult.connectionType.remote.candidateType = candidate.candidateType;
                    getStatsResult.connectionType.remote.ipAddress = candidate.ipAddress;
                    getStatsResult.connectionType.remote.networkType = candidate.networkType;
                    getStatsResult.connectionType.remote.transport = candidate.transport;
                }
            });
            getStatsResult.connectionType.transport = result.googTransportType;

            var localCandidate = getStatsResult.internal.candidates[result.localCandidateId];
            if (localCandidate) {
                if (localCandidate.ipAddress) {
                    getStatsResult.connectionType.systemIpAddress = localCandidate.ipAddress;
                }

            }

            var remoteCandidate = getStatsResult.internal.candidates[result.remoteCandidateId];
            if (remoteCandidate) {
                if (remoteCandidate.ipAddress) {
                    getStatsResult.connectionType.systemIpAddress = remoteCandidate.ipAddress;
                }
            }
        }

        if (result.type === 'transport' || result.type === 'googComponent') {
            if (!!result.selectedCandidatePairId || result.nominated === true && result.state === 'succeeded') {
                // remoteCandidateId, localCandidateId, componentId
                var localCandidate = getStatsResult.internal.candidates[result.remoteCandidateId];
                var remoteCandidate = getStatsResult.internal.candidates[result.remoteCandidateId];

                // Firefox used above two pairs for connection
            }
        }
    };

    var LOCAL_candidateType = {};
    var LOCAL_transport = {};
    var LOCAL_ipAddress = {};
    var LOCAL_networkType = {};

    getStatsParser.localcandidate = function(result) {
        if (result.type !== 'localcandidate' && result.type !== 'local-candidate') return;
        if (!result.id) return;

        if (!LOCAL_candidateType[result.id]) {
            LOCAL_candidateType[result.id] = [];
        }

        if (!LOCAL_transport[result.id]) {
            LOCAL_transport[result.id] = [];
        }

        if (!LOCAL_ipAddress[result.id]) {
            LOCAL_ipAddress[result.id] = [];
        }

        if (!LOCAL_networkType[result.id]) {
            LOCAL_networkType[result.id] = [];
        }

        if (result.candidateType && LOCAL_candidateType[result.id].indexOf(result.candidateType) === -1) {
            LOCAL_candidateType[result.id].push(result.candidateType);
        }

        if (result.transport && LOCAL_transport[result.id].indexOf(result.transport) === -1) {
            LOCAL_transport[result.id].push(result.transport);
        }

        if (result.ipAddress && LOCAL_ipAddress[result.id].indexOf(result.ipAddress + ':' + result.portNumber) === -1) {
            LOCAL_ipAddress[result.id].push(result.ipAddress + ':' + result.portNumber);
        }

        if (result.networkType && LOCAL_networkType[result.id].indexOf(result.networkType) === -1) {
            LOCAL_networkType[result.id].push(result.networkType);
        }

        getStatsResult.internal.candidates[result.id] = {
            candidateType: LOCAL_candidateType[result.id],
            ipAddress: LOCAL_ipAddress[result.id],
            portNumber: result.portNumber,
            networkType: LOCAL_networkType[result.id],
            priority: result.priority,
            transport: LOCAL_transport[result.id],
            timestamp: result.timestamp,
            id: result.id,
            type: result.type
        };

        getStatsResult.connectionType.local.candidateType = LOCAL_candidateType[result.id];
        getStatsResult.connectionType.local.ipAddress = LOCAL_ipAddress[result.id];
        getStatsResult.connectionType.local.networkType = LOCAL_networkType[result.id];
        getStatsResult.connectionType.local.transport = LOCAL_transport[result.id];
    };

    var REMOTE_candidateType = {};
    var REMOTE_transport = {};
    var REMOTE_ipAddress = {};
    var REMOTE_networkType = {};

    getStatsParser.remotecandidate = function(result) {
        if (result.type !== 'remotecandidate' && result.type !== 'remote-candidate') return;
        if (!result.id) return;

        if (!REMOTE_candidateType[result.id]) {
            REMOTE_candidateType[result.id] = [];
        }

        if (!REMOTE_transport[result.id]) {
            REMOTE_transport[result.id] = [];
        }

        if (!REMOTE_ipAddress[result.id]) {
            REMOTE_ipAddress[result.id] = [];
        }

        if (!REMOTE_networkType[result.id]) {
            REMOTE_networkType[result.id] = [];
        }

        if (result.candidateType && REMOTE_candidateType[result.id].indexOf(result.candidateType) === -1) {
            REMOTE_candidateType[result.id].push(result.candidateType);
        }

        if (result.transport && REMOTE_transport[result.id].indexOf(result.transport) === -1) {
            REMOTE_transport[result.id].push(result.transport);
        }

        if (result.ipAddress && REMOTE_ipAddress[result.id].indexOf(result.ipAddress + ':' + result.portNumber) === -1) {
            REMOTE_ipAddress[result.id].push(result.ipAddress + ':' + result.portNumber);
        }

        if (result.networkType && REMOTE_networkType[result.id].indexOf(result.networkType) === -1) {
            REMOTE_networkType[result.id].push(result.networkType);
        }

        getStatsResult.internal.candidates[result.id] = {
            candidateType: REMOTE_candidateType[result.id],
            ipAddress: REMOTE_ipAddress[result.id],
            portNumber: result.portNumber,
            networkType: REMOTE_networkType[result.id],
            priority: result.priority,
            transport: REMOTE_transport[result.id],
            timestamp: result.timestamp,
            id: result.id,
            type: result.type
        };

        getStatsResult.connectionType.remote.candidateType = REMOTE_candidateType[result.id];
        getStatsResult.connectionType.remote.ipAddress = REMOTE_ipAddress[result.id];
        getStatsResult.connectionType.remote.networkType = REMOTE_networkType[result.id];
        getStatsResult.connectionType.remote.transport = REMOTE_transport[result.id];
    };

    getStatsParser.dataSentReceived = function(result) {
        if (!result.googCodecName || (result.mediaType !== 'video' && result.mediaType !== 'audio')) return;

        if (!!result.bytesSent) {
            getStatsResult[result.mediaType].bytesSent = parseInt(result.bytesSent);
        }

        if (!!result.bytesReceived) {
            getStatsResult[result.mediaType].bytesReceived = parseInt(result.bytesReceived);
        }
    };

    var SSRC = {
        audio: {
            send: [],
            recv: []
        },
        video: {
            send: [],
            recv: []
        }
    };

    getStatsParser.ssrc = function(result) {
        if (!result.googCodecName || (result.mediaType !== 'video' && result.mediaType !== 'audio')) return;
        if (result.type !== 'ssrc') return;
        var sendrecvType = result.id.split('_').pop();
        // check sendrecvType
        if (sendrecvType != 'recv' && sendrecvType != 'send') {
            sendrecvType = result.isRemote ? 'recv' : 'send';
        }
        if (SSRC[result.mediaType][sendrecvType].indexOf(result.ssrc) === -1) {
            SSRC[result.mediaType][sendrecvType].push(result.ssrc)
        }

        getStatsResult[result.mediaType][sendrecvType].streams = SSRC[result.mediaType][sendrecvType].length;
    };

    getStatsLooper();

};

let startCoords = null; 
let endCoords = null;
let watchId = null; 
let userMarker = null; 

goongjs.accessToken = GOONG_MAP_KEY;
const map = new goongjs.Map({
    container: 'map',
    style: 'https://tiles.goong.io/assets/goong_map_web.json',
    center: [105.8523, 21.0285], 
    zoom: 13
});

map.addControl(new goongjs.NavigationControl(), 'top-right');

setupAutocomplete('start-search', 'start-suggestions', (lat, lng) => { startCoords = `${lat},${lng}`; });
setupAutocomplete('end-search', 'end-suggestions', (lat, lng) => { endCoords = `${lat},${lng}`; });

function toggleGPS() {
    const gpsBtn = document.getElementById('gps-btn');
    const gpsStatus = document.getElementById('gps-status');

    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        gpsBtn.innerText = "Bật Định Vị GPS Thực Tế";
        gpsBtn.classList.remove('active');
        gpsStatus.innerText = "🔴 GPS: Đang tắt";
        document.getElementById('start-search').disabled = false;
        if (userMarker) userMarker.remove();
    } else {
        if (!navigator.geolocation) {
            alert("Trình duyệt không hỗ trợ GPS!");
            return;
        }
        gpsStatus.innerText = "🟡 Đang kết nối GPS...";
        watchId = navigator.geolocation.watchPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                startCoords = `${lat},${lng}`;
                
                document.getElementById('start-search').value = `Vị trí của bạn (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
                document.getElementById('start-search').disabled = true;
                gpsStatus.innerText = "🟢 GPS: Sẵn sàng (Liên tục cập nhật)";
                gpsBtn.innerText = "Dừng Định Vị GPS";
                gpsBtn.classList.add('active');

                if (userMarker) {
                    userMarker.setLngLat([lng, lat]);
                } else {
                    userMarker = new goongjs.Marker({ color: '#3498db' }).setLngLat([lng, lat]).addTo(map);
                }

                if (endCoords) {
                    calculateRoute();
                } else {
                    map.flyTo({ center: [lng, lat], zoom: 15 });
                }
            },
            (error) => {
                console.error(error);
                alert("Vui lòng cấp quyền vị trí!");
                toggleGPS();
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }
}

function setupAutocomplete(inputId, suggestionsId, onSelectCallback) {
    const inputEl = document.getElementById(inputId);
    const suggestionsEl = document.getElementById(suggestionsId);

    inputEl.addEventListener('input', async function() {
        const keyword = this.value;
        if (keyword.length < 2) { suggestionsEl.style.display = 'none'; return; }

        const url = `https://rsapi.goong.io/Place/AutoComplete?api_key=${GOONG_API_KEY}&input=${encodeURIComponent(keyword)}`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            if (data.predictions) {
                suggestionsEl.innerHTML = ''; suggestionsEl.style.display = 'block';
                data.predictions.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'suggestion-item'; div.innerText = item.description;
                    div.onclick = async () => {
                        inputEl.value = item.description; suggestionsEl.style.display = 'none';
                        const detailUrl = `https://rsapi.goong.io/Place/Detail?api_key=${GOONG_API_KEY}&place_id=${item.place_id}`;
                        const resDetail = await fetch(detailUrl);
                        const dataDetail = await resDetail.json();
                        const location = dataDetail.result.geometry.location;
                        onSelectCallback(location.lat, location.lng);
                    };
                    suggestionsEl.appendChild(div);
                });
            }
        } catch (e) { console.error(e); }
    });
    document.addEventListener('click', function(e) { if (e.target !== inputEl) { suggestionsEl.style.display = 'none'; } });
}

async function calculateRoute() {
    if (!startCoords || !endCoords) { alert("Vui lòng chọn điểm kết thúc!"); return; }
    const url = `https://rsapi.goong.io/Direction?origin=${startCoords}&destination=${endCoords}&vehicle=car&api_key=${GOONG_API_KEY}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const durationInMinutes = Math.round(route.legs[0].duration.value / 60);
            const distanceInKm = (route.legs[0].distance.value / 1000).toFixed(1);

            document.getElementById('txt-duration').innerText = durationInMinutes + " phút";
            document.getElementById('txt-distance').innerText = distanceInKm + " km";
            document.getElementById('result-box').style.display = 'block';

            const points = polylineDecode(route.overview_polyline.points);
            drawRoute(points);
        }
    } catch (error) { console.error(error); }
}

function drawRoute(coordinates) {
    const geojson = { 'type': 'Feature', 'geometry': { 'type': 'LineString', 'coordinates': coordinates } };
    if (map.getSource('route_line')) {
        map.getSource('route_line').setData(geojson);
    } else {
        map.addLayer({
            'id': 'route_line', 'type': 'line',
            'source': { 'type': 'geojson', 'data': geojson },
            'layout': { 'line-join': 'round', 'line-cap': 'round' },
            'paint': { 'line-color': '#0084ff', 'line-width': 6, 'line-opacity': 0.85 }
        });
    }
    if (watchId === null) {
        const bounds = coordinates.reduce((acc, coord) => acc.extend(coord), new goongjs.LngLatBounds(coordinates[0], coordinates[0]));
        map.fitBounds(bounds, { padding: 60 });
    }
}

function polylineDecode(str, precision) {
    var index = 0, lat = 0, lng = 0, coordinates = [], shift = 0, result = 0, byte = null, lat_change, lng_change, factor = Math.pow(10, precision || 5);
    while (index < str.length) {
        shift = 0; result = 0;
        do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
        lat_change = ((result & 1) ? ~(result >> 1) : (result >> 1)); lat += lat_change;
        shift = 0; result = 0;
        do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
        lng_change = ((result & 1) ? ~(result >> 1) : (result >> 1)); lng += lng_change;
        coordinates.push([lng / factor, lat / factor]);
    }
    return coordinates;
}
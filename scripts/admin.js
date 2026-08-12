// Admin Dashboard Logic

const STATUSES = [
    "Pending", "Shipment Created", "Package Received", "Processing", "Packed",
    "On Hold", "In Transit", "Customs Clearance", "Customs Hold", "Arrived at Facility",
    "Departed Facility", "Out for Delivery", "Delivery Attempt Failed", "Delivered",
    "Delayed", "Returned to Sender", "Cancelled", "Awaiting Pickup", "Security Inspection",
    "Air Transit", "Sea Transit", "Warehouse Scan", "Distribution Center", "Routing Update",
    "Shipment Exception", "Destination Arrival", "Local Dispatch", "Loading Cargo",
    "Unloading Cargo", "Transit Pause", "Re-routed", "Awaiting Documents",
    "Insurance Verification", "Final Delivery Stage"
];

// Local Temporary State (removed, now handled via localStorage fallback in supabase.js)

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Basic Auth Check
    const token = sessionStorage.getItem('aqua_admin_token');
    if (!token) {
        window.location.href = 'admin-login.html';
        return;
    }

    if (typeof emailjs !== 'undefined') {
        // Initialize EmailJS with Public Key
        emailjs.init({
          publicKey: "cWk6e-AgL7WNdeBLD",
        });
    }

    populateDropdowns();
    generateTrackingCode();
    loadShipments();
    // Start chat widget (app.js is loaded before admin.js)
    if (typeof initChatWidget === 'function') initChatWidget();
});

function logout() {
    sessionStorage.removeItem('aqua_admin_token');
    window.location.href = 'admin-login.html';
}

// UI Helpers
function populateDropdowns() {
    // Populate Countries
    const countrySelects = document.querySelectorAll('.country-select');
    let countryOptions = '<option value="">Select Country</option>';
    COUNTRIES.forEach(c => {
        countryOptions += `<option value="${c}">${c}</option>`;
    });
    countrySelects.forEach(sel => sel.innerHTML = countryOptions);

    // Populate Statuses
    let statusOptions = '<option value="">Select Status</option>';
    STATUSES.forEach(s => {
        statusOptions += `<option value="${s}">${s}</option>`;
    });
    document.getElementById('create-status').innerHTML = statusOptions;
    document.getElementById('update-status').innerHTML = statusOptions;
    document.getElementById('edit-status').innerHTML = statusOptions;
}

function generateTrackingCode() {
    const prefix = "AC-";
    const random = Math.floor(10000000 + Math.random() * 90000000); // 8 digit random
    const code = prefix + random;
    const el = document.getElementById('create-tracking');
    if(el) el.value = code;
    return code;
}

function openModal(id) {
    const modal = document.getElementById(id);
    if(modal) {
        modal.classList.add('active');
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if(modal) {
        modal.classList.remove('active');
        // If it's a form modal, optionally reset
        const form = modal.querySelector('form');
        if(form && id !== 'create-shipment-modal') form.reset();
    }
}

// Data Fetching and Rendering
async function loadShipments() {
    const tableBody = document.getElementById('shipments-table-body');
    try {
        let shipments = [];
        if (window.db && window.db.getAllShipments) {
            shipments = await window.db.getAllShipments();
        }

        updateStats(shipments);
        renderTable(shipments);

    } catch (e) {
        console.error("Error loading shipments", e);
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: #ff4d4d;">Failed to load shipments records.</td></tr>`;
    }
}

function updateStats(shipments) {
    document.getElementById('stat-total').innerText = shipments.length;
    let transit = 0, delivered = 0;
    shipments.forEach(s => {
        if(s.status.toLowerCase() === 'delivered') delivered++;
        else if(s.status.toLowerCase() !== 'pending' && s.status.toLowerCase() !== 'cancelled') transit++;
    });
    document.getElementById('stat-transit').innerText = transit;
    document.getElementById('stat-delivered').innerText = delivered;
}

function renderTable(shipments) {
    const tableBody = document.getElementById('shipments-table-body');
    if (shipments.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-muted);">No shipments found. Create one above.</td></tr>`;
        return;
    }

    tableBody.innerHTML = '';
    shipments.forEach(s => {
        let statusClass = 'status-transit';
        if (s.status.toLowerCase() === 'delivered') statusClass = 'status-delivered';
        if (s.status.toLowerCase() === 'pending') statusClass = 'status-pending';

        // Pause/Resume button logic
        let togglePauseBtn = '';
        if (s.automated_routes && s.automated_routes.length > 0) {
            if (s.is_routing_paused) {
                togglePauseBtn = `<button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem; border-color: #03e8a4; color: #03e8a4;" onclick="toggleRoutingPause('${s.id}', false)">▶ Resume</button>`;
            } else {
                togglePauseBtn = `<button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem; border-color: #f7a00f; color: #f7a00f;" onclick="toggleRoutingPause('${s.id}', true)">⏸ Pause</button>`;
            }
        }

        const row = `
            <tr>
                <td><strong>${s.tracking_number}</strong></td>
                <td><span class="status-badge ${statusClass}">${s.status}</span></td>
                <td>${s.origin_country || '-'}</td>
                <td>${s.destination_country || '-'}</td>
                <td>${new Date(s.created_at).toLocaleDateString()}</td>
                <td>
                    ${togglePauseBtn}
                    <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="openUpdateModal('${s.id}', '${s.tracking_number}', '${s.status}')">+ Add Update</button>
                    <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem; border-color: #007bff; color: #007bff;" onclick="openEditModal('${s.id}')">Edit</button>
                    <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem; border-color: #ff4d4d; color: #ff4d4d;" onclick="handleDelete('${s.id}')">Delete</button>
                </td>
            </tr>
        `;
        tableBody.insertAdjacentHTML('beforeend', row);
    });
}

// Route Builder Logic
let routeCount = 0;
function addRouteInput() {
    routeCount++;
    const container = document.getElementById('route-inputs-container');
    const id = 'route-input-' + routeCount;
    const html = `
        <div id="${id}" style="display: flex; gap: 10px; align-items: center;">
            <div style="background: rgba(255,255,255,0.1); width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: bold;">${routeCount}</div>
            <input type="text" class="form-control route-stop-input" placeholder="e.g. Port of Loading" style="margin-bottom: 0; flex: 1;">
            <button type="button" class="btn btn-secondary" onclick="removeRouteInput('${id}')" style="padding: 5px 10px; color: #ff4d4d; border-color: #ff4d4d;">X</button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
}

function removeRouteInput(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
    // Re-number
    const routeInputs = document.querySelectorAll('#route-inputs-container > div');
    routeCount = 0;
    routeInputs.forEach(div => {
        routeCount++;
        div.id = 'route-input-' + routeCount;
        div.querySelector('div').innerText = routeCount;
        div.querySelector('button').setAttribute('onclick', `removeRouteInput('${div.id}')`);
    });
}

// Creating
async function submitCreateShipment() {
    const tracking = document.getElementById('create-tracking').value;
    const status = document.getElementById('create-status').value;
    if (!tracking || !status) return alert('Tracking number and initial status are required.');

    const data = {
        tracking_number: tracking,
        status: status,
        origin_country: document.getElementById('create-origin').value,
        destination_country: document.getElementById('create-destination').value,
        sender_details: document.getElementById('create-sender').value,
        receiver_details: document.getElementById('create-receiver').value,
        weight_kg: parseFloat(document.getElementById('create-weight').value) || null,
        dimensions: document.getElementById('create-dimensions').value,
        estimated_delivery_date: document.getElementById('create-est-date').value || null,
        package_details: document.getElementById('create-package-details').value,
        customer_name: document.getElementById('create-customer').value,
        receiver_name: document.getElementById('create-receiver-name').value,
        receiver_email: document.getElementById('create-receiver-email').value,
        receiver_phone: document.getElementById('create-receiver-phone').value,
        container_number: document.getElementById('create-container').value,
        seal_number: document.getElementById('create-seal').value,
        vessel_name: document.getElementById('create-vessel').value,
        freight_charges: parseFloat(document.getElementById('create-freight').value) || 0,
        payment_terms: document.getElementById('create-payment-terms').value,
        progress_percentage: status === 'Delivered' ? 100 : (status === 'Shipment Created' ? 5 : 10),
        
        // Automated Routing Fields
        automated_routes: Array.from(document.querySelectorAll('.route-stop-input')).map(el => el.value.trim()).filter(v => v !== ''),
        current_route_index: 0,
        is_routing_paused: false,
        next_automated_update: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() // 48 hours from now
    };

    try {
        const res = await window.db.createShipment(data);
        if (!res) {
            alert("Database Error: Could not save shipment. Please check your Firebase console or connection.");
            return;
        }

        alert("Shipment " + tracking + " created successfully!");

        // Add initial history
        await window.db.addShipmentHistory({
            shipment_id: res.id,
            location: data.origin_country || "Dispatch Center",
            status: "Shipment Created",
            description: "Electronic shipping details received and processed."
        });

        if (data.receiver_email && typeof emailjs !== 'undefined') {
            try {
                await emailjs.send("service_n8nt0he", "template_brzersu", {
                    to_email: data.receiver_email,
                    to_name: data.receiver_name || 'Customer',
                    tracking_number: data.tracking_number,
                    status: "Shipment Created",
                    location: data.origin_country || "Dispatch Center",
                    description: "Electronic shipping details received and processed."
                });
                console.log("Create shipment email sent via EmailJS");
            } catch (err) {
                console.error("Failed to send create shipment email", err);
            }
        }

        closeModal('create-shipment-modal');
        generateTrackingCode(); // prep new
        document.getElementById('create-form').reset();
        document.getElementById('route-inputs-container').innerHTML = '';
        routeCount = 0;
        await loadShipments();

    } catch (e) {
        alert('Failed to save: ' + (e.message || e) + '\nCheck console for more details.');
        console.error("Save Shipment Error:", e);
    }
}

// Updating History
function openUpdateModal(id, trackingNo, currentStatus) {
    document.getElementById('update-shipment-id').value = id;
    document.getElementById('update-tracking-display').innerText = trackingNo;
    document.getElementById('update-status').value = currentStatus;
    
    // Auto suggest progress
    let p = 50;
    if(currentStatus.toLowerCase() === 'delivered') p = 100;
    document.getElementById('update-progress').value = p;

    openModal('update-history-modal');
}

async function submitUpdateHistory() {
    const shipmentId = document.getElementById('update-shipment-id').value;
    const newStatus = document.getElementById('update-status').value;
    const loc = document.getElementById('update-location').value;
    const details = document.getElementById('update-desc').value;
    const progress = document.getElementById('update-progress').value;

    if (!newStatus || !loc) return alert('Status and Location are required.');

    try {
        await window.db.updateShipment(shipmentId, { status: newStatus, progress_percentage: parseInt(progress) || 0 });
        
        await window.db.addShipmentHistory({
            shipment_id: shipmentId,
            location: loc,
            status: newStatus,
            description: details
        });

        // Fetch shipment to get the receiver's email
        const trackingNo = document.getElementById('update-tracking-display').innerText;
        const shipment = await window.db.getShipment(trackingNo);
        if (shipment && shipment.receiver_email && typeof emailjs !== 'undefined') {
            try {
                await emailjs.send("service_n8nt0he", "template_brzersu", {
                    to_email: shipment.receiver_email,
                    to_name: shipment.receiver_name || 'Customer',
                    tracking_number: shipment.tracking_number,
                    status: newStatus,
                    location: loc,
                    description: details
                });
                console.log("Status update email sent via EmailJS");
            } catch (err) {
                console.error("Failed to send status email", err);
            }
        }

        closeModal('update-history-modal');
        document.getElementById('update-form').reset();
        await loadShipments();

    } catch (e) {
        alert('Failed to add update. Check console.');
        console.error(e);
    }
}

// Editing
async function openEditModal(id) {
    try {
        let shipments = [];
        if (window.db && window.db.getAllShipments) {
            shipments = await window.db.getAllShipments();
        }
        const s = shipments.find(x => x.id === id);
        if (!s) return alert("Shipment not found.");

        document.getElementById('edit-id').value = s.id;
        document.getElementById('edit-tracking').value = s.tracking_number || '';
        document.getElementById('edit-status').value = s.status || '';
        document.getElementById('edit-origin').value = s.origin_country || '';
        document.getElementById('edit-destination').value = s.destination_country || '';
        document.getElementById('edit-sender').value = s.sender_details || '';
        document.getElementById('edit-receiver').value = s.receiver_details || '';
        document.getElementById('edit-weight').value = s.weight_kg || '';
        document.getElementById('edit-dimensions').value = s.dimensions || '';
        document.getElementById('edit-est-date').value = s.estimated_delivery_date || '';
        document.getElementById('edit-customer').value = s.customer_name || '';
        document.getElementById('edit-receiver-name').value = s.receiver_name || '';
        document.getElementById('edit-receiver-email').value = s.receiver_email || '';
        document.getElementById('edit-receiver-phone').value = s.receiver_phone || '';
        document.getElementById('edit-container').value = s.container_number || '';
        document.getElementById('edit-seal').value = s.seal_number || '';
        document.getElementById('edit-vessel').value = s.vessel_name || '';
        document.getElementById('edit-freight').value = s.freight_charges || '';
        document.getElementById('edit-payment-terms').value = s.payment_terms || 'PREPAID';
        document.getElementById('edit-package-details').value = s.package_details || '';

        openModal('edit-shipment-modal');
    } catch (e) {
        console.error("Error opening edit modal", e);
    }
}

async function submitEditShipment() {
    const id = document.getElementById('edit-id').value;
    const status = document.getElementById('edit-status').value;
    
    if (!id) return alert('Shipment ID missing.');

    const updateData = {
        status: status,
        origin_country: document.getElementById('edit-origin').value,
        destination_country: document.getElementById('edit-destination').value,
        sender_details: document.getElementById('edit-sender').value,
        receiver_details: document.getElementById('edit-receiver').value,
        weight_kg: parseFloat(document.getElementById('edit-weight').value) || null,
        dimensions: document.getElementById('edit-dimensions').value,
        estimated_delivery_date: document.getElementById('edit-est-date').value || null,
        package_details: document.getElementById('edit-package-details').value,
        customer_name: document.getElementById('edit-customer').value,
        receiver_name: document.getElementById('edit-receiver-name').value,
        receiver_email: document.getElementById('edit-receiver-email').value,
        receiver_phone: document.getElementById('edit-receiver-phone').value,
        container_number: document.getElementById('edit-container').value,
        seal_number: document.getElementById('edit-seal').value,
        vessel_name: document.getElementById('edit-vessel').value,
        freight_charges: parseFloat(document.getElementById('edit-freight').value) || 0,
        payment_terms: document.getElementById('edit-payment-terms').value,
    };

    try {
        await window.db.updateShipment(id, updateData);
        alert("Shipment updated successfully!");
        closeModal('edit-shipment-modal');
        await loadShipments();
    } catch (e) {
        alert('Failed to update shipment: ' + (e.message || e));
        console.error("Update Shipment Error:", e);
    }
}

// Deleting
async function handleDelete(id) {
    if (confirm("Are you sure you want to delete this shipment?")) {
        try {
            await window.db.deleteShipment(id);
            await loadShipments();
        } catch (e) {
            console.error("Delete Error:", e);
            alert("Could not delete. Check console.");
        }
    }
}

// Toggle Pause/Resume
async function toggleRoutingPause(id, pauseState) {
    try {
        const updateData = { is_routing_paused: pauseState };
        if (!pauseState) {
            // When resuming, reset the timer to 48 hours from NOW so it doesn't immediately skip if it was paused a long time
            updateData.next_automated_update = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
        }
        await window.db.updateShipment(id, updateData);
        await loadShipments();
    } catch (e) {
        console.error("Toggle Pause Error:", e);
        alert("Failed to toggle routing state.");
    }
}

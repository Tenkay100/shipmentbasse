// Aqua Cargo - Firebase Integration

const firebaseConfig = {
    apiKey: "AIzaSyC-zEXkZy6yygZcKCJZE_jORLeBqG5p5ok",
    authDomain: "basit-cargo.firebaseapp.com",
    projectId: "basit-cargo",
    storageBucket: "basit-cargo.firebasestorage.app",
    messagingSenderId: "1043593885965",
    appId: "1:1043593885965:web:f4b6dca30037f1c9ef1844"
};

// Initialize Firebase if not already initialized
if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
} else {
    console.error("Firebase SDK not loaded. Please ensure Firebase CDNs are included in the HTML.");
}

const firestoreDb = typeof firebase !== 'undefined' ? firebase.firestore() : null;

// ----------------------
// Local Storage Fallback
// ----------------------
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function getLocalShipments() {
    try {
        const s = localStorage.getItem('aqua_shipments');
        const parsed = s ? JSON.parse(s) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function setLocalShipments(data) {
    localStorage.setItem('aqua_shipments', JSON.stringify(data));
}

function getLocalHistory() {
    try {
        const h = localStorage.getItem('aqua_history');
        const parsed = h ? JSON.parse(h) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function setLocalHistory(data) {
    localStorage.setItem('aqua_history', JSON.stringify(data));
}

// ----------------------
// Tracker API Methods (Firestore)
// ----------------------

async function processAutomatedRouting(shipmentData) {
    if (!shipmentData.automated_routes || shipmentData.automated_routes.length === 0) return shipmentData;
    if (shipmentData.is_routing_paused) return shipmentData;
    if (!shipmentData.next_automated_update) return shipmentData;
    
    let nextUpdate = new Date(shipmentData.next_automated_update);
    let now = new Date();
    
    if (now >= nextUpdate) {
        let diffMs = now - nextUpdate;
        let intervalsPassed = Math.floor(diffMs / (48 * 60 * 60 * 1000)) + 1; 
        
        let newIndex = shipmentData.current_route_index || 0;
        let historyUpdates = [];
        let routes = shipmentData.automated_routes;
        let finalStatus = shipmentData.status;
        
        for (let i = 0; i < intervalsPassed; i++) {
            if (newIndex < routes.length - 1) {
                newIndex++;
                let status = "Arrived at Facility";
                
                if (newIndex === routes.length - 1) {
                    status = "Delivered";
                }
                
                finalStatus = status;
                
                historyUpdates.push({
                    shipment_id: shipmentData.id,
                    location: routes[newIndex],
                    status: status,
                    description: "Shipment updated.",
                    update_date: new Date(nextUpdate.getTime() + (i * 48 * 60 * 60 * 1000)).toISOString()
                });
                
                if (newIndex === routes.length - 1) break; 
            } else {
                break;
            }
        }
        
        if (newIndex !== shipmentData.current_route_index) {
            const newNextUpdate = new Date(nextUpdate.getTime() + (intervalsPassed * 48 * 60 * 60 * 1000)).toISOString();
            
            const updatePayload = {
                current_route_index: newIndex,
                next_automated_update: newNextUpdate,
                status: finalStatus,
                progress_percentage: newIndex === routes.length - 1 ? 100 : Math.min(90, (newIndex / routes.length) * 100)
            };
            
            if (typeof firestoreDb !== 'undefined' && firestoreDb) {
                try {
                    await firestoreDb.collection('shipments').doc(shipmentData.id).update(updatePayload);
                    
                    const batch = firestoreDb.batch();
                    const historyRef = firestoreDb.collection('shipment_history');
                    historyUpdates.forEach(hu => {
                        const newDoc = historyRef.doc();
                        batch.set(newDoc, hu);
                        if(!shipmentData.shipment_history) shipmentData.shipment_history = [];
                        shipmentData.shipment_history.push({ id: newDoc.id, ...hu });
                    });
                    await batch.commit();
                    
                    Object.assign(shipmentData, updatePayload);

                    if (typeof emailjs !== 'undefined' && shipmentData.receiver_email) {
                        for (let hu of historyUpdates) {
                            try {
                                await emailjs.send("service_n8nt0he", "template_brzersu", {
                                    to_email: shipmentData.receiver_email,
                                    to_name: shipmentData.receiver_name || 'Customer',
                                    tracking_number: shipmentData.tracking_number,
                                    status: hu.status,
                                    location: hu.location,
                                    description: hu.description
                                });
                                console.log("Automated status update email sent via EmailJS");
                            } catch (err) {
                                console.error("Failed to send automated status email", err);
                            }
                        }
                    }
                } catch(e) {
                    console.error("Failed automated route update", e);
                }
            } else {
                 Object.assign(shipmentData, updatePayload);
                 let localShipments = getLocalShipments();
                 let idx = localShipments.findIndex(x => x.id === shipmentData.id);
                 if(idx !== -1) {
                     localShipments[idx] = shipmentData;
                     setLocalShipments(localShipments);
                 }
                 let localHistory = getLocalHistory();
                 historyUpdates.forEach(hu => {
                     hu.id = uuidv4();
                     localHistory.push(hu);
                     if(!shipmentData.shipment_history) shipmentData.shipment_history = [];
                     shipmentData.shipment_history.push(hu);
                 });
                 setLocalHistory(localHistory);

                 if (typeof emailjs !== 'undefined' && shipmentData.receiver_email) {
                     for (let hu of historyUpdates) {
                         try {
                             await emailjs.send("service_n8nt0he", "template_brzersu", {
                                 to_email: shipmentData.receiver_email,
                                 to_name: shipmentData.receiver_name || 'Customer',
                                 tracking_number: shipmentData.tracking_number,
                                 status: hu.status,
                                 location: hu.location,
                                 description: hu.description
                             });
                             console.log("Automated status update email sent via EmailJS (fallback)");
                         } catch (err) {
                             console.error("Failed to send automated status email (fallback)", err);
                         }
                     }
                 }
            }
        }
    }
    
    return shipmentData;
}

async function getShipment(trackingNumber) {
    const localFallback = async () => {
        const s = getLocalShipments().find(x => x.tracking_number === trackingNumber);
        if (s) {
            s.shipment_history = getLocalHistory().filter(h => h.shipment_id === s.id);
            return await processAutomatedRouting(s);
        }
        return null;
    };

    if (!firestoreDb) return localFallback();

    try {
        const shipmentsRef = firestoreDb.collection('shipments');
        const querySnapshot = await shipmentsRef.where('tracking_number', '==', trackingNumber).get();
        
        if (querySnapshot.empty) {
            // Check local fallback just in case it was created offline
            return await localFallback();
        }
        
        // Assuming tracking number is unique, take the first one
        const doc = querySnapshot.docs[0];
        const shipmentData = { id: doc.id, ...doc.data() };
        
        // Fetch history
        const historyRef = firestoreDb.collection('shipment_history');
        const historySnapshot = await historyRef.where('shipment_id', '==', shipmentData.id).get();
        
        shipmentData.shipment_history = historySnapshot.docs.map(hDoc => ({ id: hDoc.id, ...hDoc.data() }));
        
        return await processAutomatedRouting(shipmentData);
    } catch (err) {
        console.error("Error fetching shipment from Firebase, using local fallback", err);
        return localFallback();
    }
}

async function getAllShipments() {
    const localFallback = async () => {
        let shipments = getLocalShipments().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        for (let i=0; i<shipments.length; i++) {
            shipments[i] = await processAutomatedRouting(shipments[i]);
        }
        return shipments;
    };

    if (!firestoreDb) return localFallback();
    
    try {
        const shipmentsRef = firestoreDb.collection('shipments');
        const querySnapshot = await shipmentsRef.orderBy('created_at', 'desc').get();
        
        let docs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        for (let i=0; i<docs.length; i++) {
            docs[i] = await processAutomatedRouting(docs[i]);
        }
        return docs;
    } catch (err) {
        console.error("Error fetching all shipments from Firebase, using local fallback", err);
        return localFallback();
    }
}

async function createShipment(shipmentData) {
    const fallbackId = uuidv4();
    shipmentData.created_at = shipmentData.created_at || new Date().toISOString();

    const localFallback = () => {
        shipmentData.id = fallbackId;
        const shipments = getLocalShipments();
        shipments.push(shipmentData);
        setLocalShipments(shipments);
        return shipmentData;
    };

    if (!firestoreDb) return localFallback();
    
    try {
        const shipmentsRef = firestoreDb.collection('shipments');
        const docRef = await shipmentsRef.add(shipmentData);
        return { id: docRef.id, ...shipmentData };
    } catch (err) {
        console.error("Error creating shipment in Firebase, using local fallback", err);
        return localFallback();
    }
}

async function updateShipment(shipmentId, updateData) {
    const localFallback = () => {
        const shipments = getLocalShipments();
        const idx = shipments.findIndex(x => x.id === shipmentId);
        if (idx !== -1) {
            shipments[idx] = { ...shipments[idx], ...updateData };
            setLocalShipments(shipments);
            return shipments[idx];
        }
        return null;
    };

    if (!firestoreDb) return localFallback();
    
    try {
        const docRef = firestoreDb.collection('shipments').doc(shipmentId);
        await docRef.update(updateData);
        
        // Fetch the updated document to return it
        const docSnap = await docRef.get();
        return { id: docSnap.id, ...docSnap.data() };
    } catch (err) {
        console.error("Error updating shipment in Firebase, using local fallback", err);
        return localFallback();
    }
}

async function deleteShipment(shipmentId) {
    const localFallback = () => {
        let shipments = getLocalShipments();
        shipments = shipments.filter(x => x.id !== shipmentId);
        setLocalShipments(shipments);
        return true;
    };

    if (!firestoreDb) return localFallback();
    
    try {
        await firestoreDb.collection('shipments').doc(shipmentId).delete();
        
        // Also delete associated history
        const historyRef = firestoreDb.collection('shipment_history');
        const historySnapshot = await historyRef.where('shipment_id', '==', shipmentId).get();
        
        const batch = firestoreDb.batch();
        historySnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        
        return true;
    } catch (err) {
        console.error("Error deleting shipment in Firebase, using local fallback", err);
        return localFallback();
    }
}

async function addShipmentHistory(historyData) {
    historyData.update_date = historyData.update_date || new Date().toISOString();

    const localFallback = () => {
        historyData.id = uuidv4();
        const history = getLocalHistory();
        history.push(historyData);
        setLocalHistory(history);
        return historyData;
    };

    if (!firestoreDb) return localFallback();
    
    try {
        const historyRef = firestoreDb.collection('shipment_history');
        const docRef = await historyRef.add(historyData);
        return { id: docRef.id, ...historyData };
    } catch (err) {
        console.error("Error adding history in Firebase, using local fallback", err);
        return localFallback();
    }
}

// Export for module usage (if enabled), otherwise accessible in window
window.db = window.db || {
    getShipment,
    getAllShipments,
    createShipment,
    updateShipment,
    deleteShipment,
    addShipmentHistory
};

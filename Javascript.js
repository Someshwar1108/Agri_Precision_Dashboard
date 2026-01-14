
// CONFIGURATION & SUPABASE SETUP
const USE_SUPABASE = true;
const SUPABASE_URL = 'https://zbpgtqtzvkxxmaueptvt.supabase.co';
const SUPABASE_KEY = '......'
const TABLE_NAME = 'agri_data';

let supabaseClient;
if (USE_SUPABASE && typeof window.supabase !== 'undefined') {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

let globalData = [];
let deleteTargetId = null;

let chartInstances = {};


document.addEventListener('DOMContentLoaded', () => {
    fetchData();

    document.getElementById('agriForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleFormSubmit();
    });
});

// LOGIC & DATA HANDLING

async function fetchData() {
    if (USE_SUPABASE && supabaseClient) {
        const { data, error } = await supabaseClient.from(TABLE_NAME).select('*');

        if (error) {
            console.error("Error fetching data:", error);
        } else if (data) {

            globalData = data.map(item => ({
                ...item,
                id: item.id, // Keep numeric ID
                name: item.Farmer_name,
                location: item.Location,
                crop: item['Crop Type'],
                n: item.N,
                p: item.P,
                k: item.K,
                fertilizer: item.Fertilizer,
                rainfall: item.Rainfall,
                yield: item.Yield,
                notes: item.Note
            }));
        }
    }
    // Process data (calculate efficiency)
    processData();
    updateDashboard();
}

function processData() {
    // Efficiency = Yield / Fertilizer formatted to 4 decimals
    globalData.forEach(item => {
        const ratio = item.yield / item.fertilizer;
        item.efficiency = ratio.toFixed(4);
    });
}

async function handleFormSubmit() {
    const editId = document.getElementById('editId').value;

    // 1. Capture Data (Internal App Structure)
    const formData = {
        name: document.getElementById('inputName').value,
        location: document.getElementById('inputLoc').value,
        crop: document.getElementById('inputCrop').value,
        n: parseInt(document.getElementById('inputN').value),
        p: parseInt(document.getElementById('inputP').value),
        k: parseInt(document.getElementById('inputK').value),
        fertilizer: parseFloat(document.getElementById('inputFert').value),
        rainfall: parseFloat(document.getElementById('inputRain').value),
        yield: parseFloat(document.getElementById('inputYield').value),
        notes: document.getElementById('inputNotes').value || ''
    };

    // ADAPTER: Prepare Payload for Database (Exact Schema)
    const dbPayload = {
        "Farmer_name": formData.name,
        "Location": formData.location,
        "Crop Type": formData.crop,
        "N": formData.n,
        "P": formData.p,
        "K": formData.k,
        "Fertilizer": formData.fertilizer,
        "Rainfall": formData.rainfall,
        "Yield": formData.yield,
        "Note": formData.notes
    };


    // 2. Save (Edit or Create)
    if (editId) {

        if (USE_SUPABASE && supabaseClient) {
            const numericId = parseInt(editId, 10);

            if (isNaN(numericId)) {
                alert("Error: Invalid ID for update (NaN). Edit ID was: " + editId);
                return;
            }

            const { data, error } = await supabaseClient
                .from(TABLE_NAME)
                .update(dbPayload)
                .eq('id', numericId)
                .select();

            if (error) {
                console.error('Error updating:', error.message);
                alert("Error updating data: " + error.message);
                return;
            }
            fetchData();
        }
    } else {
        // --- CREATE NEW ---

        if (USE_SUPABASE && supabaseClient) {
            // 1. Fetch all IDs to find the first "gap" or reset to 1
            const { data: existingData, error: fetchError } = await supabaseClient
                .from(TABLE_NAME)
                .select('id')
                .order('id', { ascending: true });

            if (fetchError) {
                console.error('Error fetching IDs:', fetchError.message);
                alert("Error checking next ID: " + fetchError.message);
                return;
            }

            // 2. Calculate valid ID (Reuse gaps)
            let nextId = 1;
            if (existingData && existingData.length > 0) {
                const ids = existingData.map(row => row.id);

                for (let i = 0; i < ids.length; i++) {
                    if (ids[i] !== nextId) {
                        break;
                    }
                    nextId++;
                }
            }

            // 3. Insert with EXPLICIT ID
            const insertPayload = {
                id: nextId,
                ...dbPayload
            };

            const { error } = await supabaseClient.from(TABLE_NAME).insert([insertPayload]);

            if (error) {
                console.error('Error:', error.message);
                alert("Error saving data: " + error.message + "\nCheck console for details.");
                return;
            }
            fetchData();
        }
    }


    // 3. Close & Reset
    document.getElementById('agriForm').reset();
    document.getElementById('editId').value = ""; // Clear edit ID
    toggleModal('addModal');
}
// UI UPDATES

function openAddModal() {

    document.getElementById('agriForm').reset();
    document.getElementById('editId').value = "";
    document.getElementById('modal-title').innerHTML = '<i class="fa-solid fa-pen-to-square mr-2"></i> Record New Farm Data';
    toggleModal('addModal');
}

function openEditModal(id) {

    const record = globalData.find(item => item.id == id);
    if (!record) return;


    document.getElementById('editId').value = record.id;
    document.getElementById('inputName').value = record.name;
    document.getElementById('inputLoc').value = record.location;
    document.getElementById('inputCrop').value = record.crop;
    document.getElementById('inputN').value = record.n;
    document.getElementById('inputP').value = record.p;
    document.getElementById('inputK').value = record.k;
    document.getElementById('inputFert').value = record.fertilizer;
    document.getElementById('inputRain').value = record.rainfall;
    document.getElementById('inputYield').value = record.yield;
    document.getElementById('inputNotes').value = record.notes || '';


    document.getElementById('modal-title').innerHTML = `<i class="fa-solid fa-pen-to-square mr-2"></i> Edit Data: ${id}`;


    toggleModal('addModal');
}

async function handleFileImport(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const validTypes = ['.csv', '.xlsx', '.xls'];
        const fileExtension = '.' + file.name.split('.').pop().toLowerCase();

        if (!validTypes.includes(fileExtension)) {
            alert('Please select a valid CSV or Excel file.');
            input.value = '';
            return;
        }


        const originalText = "Import CSV";

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            if (jsonData.length === 0) {
                alert("The file appears to be empty.");
                return;
            }

            await processImportedData(jsonData);

        } catch (error) {
            console.error("Error parsing file:", error);
            alert("Error parsing file. Please check the format.");
        } finally {
            input.value = ''; // Reset
        }
    }
}

async function processImportedData(jsonData) {


    const validRows = [];

    jsonData.forEach((row, index) => {

        const getValue = (keys) => {
            for (let k of keys) {
                if (row[k] !== undefined) return row[k];
            }
            return null;
        };

        // Split N-P-K string (e.g., "120-60-40")
        let n = 0, p = 0, k = 0;
        const npkRaw = getValue(['SOIL (N-P-K)', 'Soil', 'N-P-K', 'NPK']);
        if (typeof npkRaw === 'string' && npkRaw.includes('-')) {
            const parts = npkRaw.split('-').map(x => parseInt(x.trim()));
            if (parts.length === 3) [n, p, k] = parts;
        }

        const newRow = {
            "Farmer_name": getValue(['FARMER', 'Farmer', 'Farmer Name', 'Name']),
            "Location": getValue(['LOCATION', 'Location']),
            "Crop Type": getValue(['CROP', 'Crop', 'Crop Type']),
            "N": n,
            "P": p,
            "K": k,
            "Fertilizer": parseFloat(getValue(['FERT (KG)', 'Fertilizer', 'Fert'])),
            "Rainfall": parseFloat(getValue(['RAIN (MM)', 'Rainfall', 'Rain'])),
            "Yield": parseFloat(getValue(['YIELD (TONS)', 'Yield'])),
            "Note": getValue(['NOTES', 'Notes', 'Note']) || ''
        };

        // Simple validation: Ensure essential fields exist
        if (newRow["Farmer_name"] && newRow["Location"] && newRow["Yield"]) {
            validRows.push(newRow);
        } else {
            console.warn(`Row ${index + 2} skipped due to missing data:`, row);
        }
    });

    if (validRows.length === 0) {
        alert("No valid rows could be mapped. Please check your column headers.");
        return;
    }

    // Upload to Supabase 
    if (USE_SUPABASE && supabaseClient) {

        const { data: existingData } = await supabaseClient
            .from(TABLE_NAME)
            .select('id')
            .order('id', { ascending: false })
            .limit(1);

        let nextId = (existingData && existingData.length > 0) ? existingData[0].id + 1 : 1;

        // Assign IDs
        const rowsWithIds = validRows.map((r, i) => ({
            ...r,
            id: nextId + i
        }));

        const { error } = await supabaseClient.from(TABLE_NAME).insert(rowsWithIds);

        if (error) {
            console.error("Batch upload error:", error);
            alert("Error uploading data to server: " + error.message);
        } else {
            alert(`Successfully imported ${rowsWithIds.length} records!`);
            fetchData();
        }

    }
}

function switchTab(tabName) {
    const dashboardView = document.getElementById('view-dashboard');
    const dataView = document.getElementById('view-data');
    const btnDash = document.getElementById('btn-dashboard');
    const btnData = document.getElementById('btn-data');

    // Reset classes
    const activeClass = "bg-white text-emerald-900 font-bold shadow".split(" ");
    const inactiveClass = "text-emerald-100 hover:bg-emerald-700/50".split(" ");

    if (tabName === 'dashboard') {
        dashboardView.classList.remove('hidden');
        dataView.classList.add('hidden');

        btnDash.classList.add(...activeClass);
        btnDash.classList.remove(...inactiveClass);
        btnData.classList.remove(...activeClass);
        btnData.classList.add(...inactiveClass);

        // Re-render charts to fix canvas sizing issues on tab switch
        renderCharts();
    } else {
        dashboardView.classList.add('hidden');
        dataView.classList.remove('hidden');

        btnDash.classList.remove(...activeClass);
        btnDash.classList.add(...inactiveClass);
        btnData.classList.add(...activeClass);
        btnData.classList.remove(...inactiveClass);

        renderTable();
    }
}

function updateDashboard() {
    // 0. Handle Empty Data State
    if (globalData.length === 0) {
        // Reset KPIs to placeholders
        // Use Score as placeholder unit
        document.getElementById('kpi-efficiency').innerHTML = `-- <span class="text-lg text-slate-400 font-normal">Score</span>`;
        document.getElementById('kpi-top-yield').innerHTML = `-- <span class="text-lg text-slate-400 font-normal">Tons</span>`;
        document.getElementById('kpi-top-farmer').innerText = `Farmer: --`;
        document.getElementById('kpi-rainfall').innerHTML = `-- <span class="text-lg text-slate-400 font-normal">mm</span>`;
        // Clear location too
        document.getElementById('kpi-rain-loc').innerText = `Location: --`;

        document.getElementById('kpi-count').innerHTML = `0 <span class="text-lg text-slate-400 font-normal">Active</span>`;

        // Clear Lists/Tables with friendly message
        document.getElementById('top-performers-list').innerHTML = '<div class="p-4 text-center text-slate-400 italic">No data available. Add an entry to get started.</div>';
        document.getElementById('data-table-body').innerHTML = '<tr><td colspan="11" class="p-8 text-center text-slate-400 italic">No data records found. Click "Add Entry" to begin.</td></tr>';

        // Clear Charts
        renderCharts(); // Will render empty charts
        return;
    }

    // 1. KPIs
    const totalEff = globalData.reduce((sum, item) => sum + parseFloat(item.efficiency), 0);
    const avgEff = (totalEff / globalData.length).toFixed(4); // Decimal Average
    // Show decimal and Score label
    document.getElementById('kpi-efficiency').innerHTML = `${avgEff} <span class="text-lg text-slate-400 font-normal">Score</span>`;

    const sortedByYield = [...globalData].sort((a, b) => b.yield - a.yield);
    const top = sortedByYield[0];
    document.getElementById('kpi-top-yield').innerHTML = `${top.yield} <span class="text-lg text-slate-400 font-normal">Tons</span>`;
    document.getElementById('kpi-top-farmer').innerText = `Farmer: ${top.name}`;

    // FIND MAX RAINFALL AND ITS LOCATION
    const maxRainEntry = globalData.reduce((prev, current) => (prev.rainfall > current.rainfall) ? prev : current);
    document.getElementById('kpi-rainfall').innerHTML = `${maxRainEntry.rainfall} <span class="text-lg text-slate-400 font-normal">mm</span>`;
    document.getElementById('kpi-rain-loc').innerText = `Location: ${maxRainEntry.location}`;

    document.getElementById('kpi-count').innerHTML = `${globalData.length} <span class="text-lg text-slate-400 font-normal">Active</span>`;

    // 2. Lists
    renderTopPerformers(sortedByYield.slice(0, 5));
    renderTable();

    // 3. Charts
    renderCharts();
}

function renderTopPerformers(topList) {
    const listContainer = document.getElementById('top-performers-list');
    listContainer.innerHTML = '';

    topList.forEach((farmer, index) => {
        const badgeColor = index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-slate-400' : index === 2 ? 'bg-orange-400' : 'bg-emerald-200 text-emerald-800';

        const div = document.createElement('div');
        div.className = "flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 hover:border-emerald-200 transition-colors";
        div.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white shadow-sm ${badgeColor}">
                            ${index + 1}
                        </div>
                        <div>
                            <p class="font-bold text-slate-800 text-sm">${farmer.name}</p>
                            <p class="text-xs text-slate-500">${farmer.crop}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <span class="block font-bold text-emerald-700">${farmer.yield} t</span>
                    </div>
                `;
        listContainer.appendChild(div);
    });
}

function renderTable() {
    const tbody = document.getElementById('data-table-body');
    tbody.innerHTML = '';

    // Reverse chronological order
    [...globalData].reverse().forEach(row => {
        const cropColors = {
            'Rice': 'bg-emerald-50 text-emerald-700 border-emerald-200',
            'Maize': 'bg-yellow-50 text-yellow-700 border-yellow-200',
            'Cotton': 'bg-indigo-50 text-indigo-700 border-indigo-200',
            'Wheat': 'bg-amber-50 text-amber-700 border-amber-200'
        };

        const tr = document.createElement('tr');
        tr.className = "hover:bg-emerald-50/50 transition-colors border-b border-slate-100";
        tr.innerHTML = `
                    <td class="px-6 py-4 font-mono text-slate-500 text-xs">${row.id}</td>
                    <td class="px-6 py-4 font-medium text-slate-900">${row.name}</td>
                    <td class="px-6 py-4">${row.location}</td>
                    <td class="px-6 py-4">
                        <span class="px-2 py-1 rounded-md text-xs font-bold border ${cropColors[row.crop] || ''}">
                            ${row.crop}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-xs font-mono">${row.n}-${row.p}-${row.k}</td>
                    <td class="px-6 py-4">${row.fertilizer}</td>
                    <td class="px-6 py-4">${row.rainfall}</td>
                    <td class="px-6 py-4 text-right font-bold text-slate-800">${row.yield}</td>
                    <td class="px-6 py-4 text-right font-mono text-emerald-600">${row.efficiency}</td>
                    <td class="px-6 py-4 text-xs text-slate-500 italic max-w-[150px] truncate" title="${row.notes || ''}">${row.notes || '-'}</td>
                    <td class="px-6 py-4 text-center whitespace-nowrap">
                        <button onclick="openEditModal('${row.id}')" class="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50 transition-colors" title="Edit Entry">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button onclick="openDeleteModal('${row.id}')" class="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition-colors ml-1" title="Delete Entry">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                `;
        tbody.appendChild(tr);
    });
}

// DELETE LOGIC USING CUSTOM MODAL

window.openDeleteModal = function (id) {
    deleteTargetId = id;
    toggleModal('deleteModal');
}

window.confirmDelete = async function () {
    console.log("DEBUG: confirmDelete called (Version: Fix-Applied)");
    if (!deleteTargetId) return;

    const id = deleteTargetId;

    if (USE_SUPABASE && supabaseClient) {
        const numericId = parseInt(id, 10); // Ensure ID is integer

        if (isNaN(numericId)) {
            alert("Error: Invalid ID for delete (NaN). ID was: " + id);
            return;
        }

        const { data, error } = await supabaseClient
            .from(TABLE_NAME)
            .delete()
            .eq('id', numericId)
            .select(); // Return deleted data to verify impact

        if (error) {
            console.error('Error deleting:', error.message);
            alert("Error deleting: " + error.message);
        } else {

            fetchData();
        }
    }
    // Reset and Close
    deleteTargetId = null;
    toggleModal('deleteModal');
}

function renderCharts() {
    // Check if chart canvas exists (it might be hidden in tab view)
    if (!document.getElementById('yieldChart')) return;

    // --- DATA PREP ---

    // 1. Avg Yield by Crop
    const crops = [...new Set(globalData.map(d => d.crop))];
    const avgYields = crops.map(c => {
        const items = globalData.filter(d => d.crop === c);
        const avg = items.reduce((sum, i) => sum + i.yield, 0) / items.length;
        return avg;
    });

    // 2. Fertilizer vs Yield
    // SWAP: x = Yield, y = Fertilizer (to put Fertilizer on Y-axis)
    const scatterData = globalData.map(d => ({ x: d.yield, y: d.fertilizer }));

    // 3. Avg Yield by Location
    const locations = [...new Set(globalData.map(d => d.location))];
    const locYields = locations.map(l => {
        const items = globalData.filter(d => d.location === l);
        const avg = items.reduce((sum, i) => sum + i.yield, 0) / items.length;
        return avg;
    });

    // --- DRAWING ---

    destroyChart('yieldChart');
    chartInstances['yieldChart'] = new Chart(document.getElementById('yieldChart'), {
        type: 'bar',
        data: {
            labels: crops,
            datasets: [{
                label: 'Avg Yield (Tons)',
                data: avgYields,
                backgroundColor: '#059669', // emerald-600
                borderRadius: 4,
                maxBarThickness: 50 // Changed to 50
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Crop Type', font: { weight: 'bold' } }
                },
                y: {
                    beginAtZero: true,
                    suggestedMax: 10,
                    title: { display: true, text: 'Yield (Tons)', font: { weight: 'bold' } },
                    ticks: {
                        stepSize: 2, // Forces steps of 2 (2, 4, 6, 8...)
                        precision: 0
                    }
                }
            }
        }
    });

    destroyChart('scatterChart');
    chartInstances['scatterChart'] = new Chart(document.getElementById('scatterChart'), {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Yield vs Fertilizer',
                data: scatterData,
                backgroundColor: '#3b82f6' // blue-500
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Yield (Tons)', font: { weight: 'bold' } },
                    beginAtZero: true,
                    suggestedMax: 10,
                    ticks: {
                        stepSize: 2,
                        precision: 0
                    }
                },
                y: {
                    beginAtZero: true,
                    suggestedMax: 100, // Shows decent range when empty
                    title: { display: true, text: 'Fertilizer', font: { weight: 'bold' } },
                    ticks: {
                        stepSize: 20, // Forces steps of 20 (20, 40, 60...)
                        callback: function (value) {
                            return value + 'kg'; // Appends 'kg' to the label
                        }
                    }
                }
            }
        }
    });

    destroyChart('locationChart');
    chartInstances['locationChart'] = new Chart(document.getElementById('locationChart'), {
        type: 'bar',
        data: {
            labels: locations,
            datasets: [{
                label: 'Yield per Location',
                data: locYields,
                backgroundColor: '#d97706', // amber-600
                borderRadius: 4,
                maxBarThickness: 40
            }]
        },
        options: {
            indexAxis: 'y', // Horizontal Bar
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { // Value axis for horizontal bar
                    beginAtZero: true,
                    suggestedMax: 10,
                    title: { display: true, text: 'Yield (Tons)', font: { weight: 'bold' } },
                    ticks: {
                        stepSize: 2, // Forces steps of 2 (2, 4, 6, 8...)
                        precision: 0
                    }
                },
                y: { // Category axis
                    title: { display: true, text: 'Location', font: { weight: 'bold' } }
                }
            }
        }
    });
}

function destroyChart(id) {
    if (chartInstances[id]) {
        chartInstances[id].destroy();
    }
}



// Re-implement simple toggle for Tailwind Modal without ID confusion
window.toggleModal = function (modalID) {
    const modal = document.getElementById(modalID);
    modal.classList.toggle('hidden');
    document.body.classList.toggle('modal-active');
}


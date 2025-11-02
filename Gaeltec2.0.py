# dashboard.py
import streamlit as st
import pandas as pd
import plotly.express as px
import re
from PIL import Image

# --- MAPPING CATEGORIES ---
pole_keys = [
    "9x220 BIOCIDE LV POLE", "9x275 BIOCIDE LV POLE", "12x250 BIOCIDE LV POLE",
    "12x305 BIOCIDE LV POLE", "13x260 BIOCIDE LV POLE", "13x320 BIOCIDE LV POLE",
    "14x275 BIOCIDE LV POLE", "14x335 BIOCIDE LV POLE", "16x305 BIOCIDE LV POLE",
    "16x365 BIOCIDE LV POLE", "9x220 CREOSOTE LV POLE", "9x275 CREOSOTE LV POLE",
    "12x250 CREOSOTE LV POLE", "12x305 CREOSOTE LV POLE", "13x260 CREOSOTE LV POLE",
    "13x320 CREOSOTE LV POLE", "14x275 CREOSOTE LV POLE", "14x335 CREOSOTE LV POLE",
    "16x305 CREOSOTE LV POLE", "16x365 CREOSOTE LV POLE", "9x220 HV SINGLE POLE",
    "9x275 HV SINGLE POLE", "9x295 HV SINGLE POLE", "9x315 HV SINGLE POLE",
    "12x250 HV SINGLE POLE", "12x305 HV SINGLE POLE", "12x325 HV SINGLE POLE",
    "12x345 HV SINGLE POLE", "13x260 HV SINGLE POLE", "13x320 HV SINGLE POLE",
    "13x340 HV SINGLE POLE", "13x365 HV SINGLE POLE", "14x275 HV SINGLE POLE",
    "14x335 HV SINGLE POLE", "14x355 HV SINGLE POLE", "14x375 HV SINGLE POLE",
    "16x305 HV SINGLE POLE", "16x365 HV SINGLE POLE", "16x385 HV SINGLE POLE",
    "16x405 HV SINGLE POLE", "10x230 BIOCIDE LV POLE", "10x285 BIOCIDE LV POLE",
    "10x230 CREOSOTE LV POLE", "10x285 CREOSOTE LV POLE", "10x230 HV SINGLE POLE",
    "10x285 HV SINGLE POLE", "10x305 HV SINGLE POLE", "10x325 HV SINGLE POLE",
    "10x230 H POLE HV Creosote", "10x285 H POLE HV Creosote", "10x305 H POLE HV Creosote",
    "10x325 H POLE HV Creosote", "10x285 EHV SINGLE POLE CREOSOTE",
    "10x305 EHV SINGLE POLE CREOSOTE", "10x325 EHV SINGLE POLE CREOSOTE"
]

# Updated equipment_keys based on your reference
equipment_keys = [
    "Noja",
    "Erect 11kV/33kV ABSW",
    "Lower / Raise existing equipment associated with pole change or clearance issues; HV Fuses/Pole Box/ABSW",
    "11kv ABSW Hookstick Standard",
    "11kv ABSW Hookstick Spring loaded mech",
    "33kv ABSW Hookstick Dependant",
    "Erect 11kV Remote Controlled Switch Disconnector ( Soule Auguste ) or Auto Reclosure unit c/w VT, Aerial, RTU & umbilical cable.",
    "11kV PMSW (Soule)",
    "ABC 2 core x 35mm² + 25mm² bare earth (250m drums)",
    "ABC 2 core x 35mm² (250m drums)",
    "ABC 2 core x 50mm² (250m drums)",
    "ABC 2 core x 95mm² (250m drums)",
    "ABC 2 core x 50mm² + 50mm² bare earth  (300m drums)",
    "ABC 4 core x 35mm² + 25mm² bare earth (250m drums)",
    "ABC 4 core x 35mm² (250m drums)",
    "ABC 4 core x 50mm² (250m drums)",
    "ABC 4 core x 95mm² (250m drums)",
    "ABC 4 core x 50mm² + 50mm² bare earth  (300m drums)",
    "ABC 4 core x 95mm² + 50mm² bare earth (300m drums)",
    "ABC 4 core x 120mm² + 50mm² bare earth",
    "Install conductor, run out, sag, terminate, clamp in and form jumper loops; >=200mm²",
    "Install conductor, run out, sag, terminate, clamp in and connect jumpers; 2c",
    "Install conductor, run out, sag, terminate, clamp in and connect jumpers; 4c",
    "Install conductor, run out, sag, terminate, clamp in and connect jumpers; 2c + Earth",
    "Install conductor, run out, sag, terminate, clamp in and connect jumpers; 4c + Earth"
]

transformer_keys = [
    "Transformer 1ph 50kVA", "Transformer 3ph 50kVA", "Erect pole mounted transformer up to 100kVA 1.ph.",
    "Erect pole mounted transformer up to 200kVA 3.p.h.", "Transformer 1ph 25kVA", "Transformer 3ph 200kVA",
    "Transformer 3ph 100kVA", "Single Pole Transformer Platform Steelwork", "'H' Pole Transformer Platform Steelwork"
]


equipment_keys = [
    "Noja",
    "Erect 11kV/33kV ABSW",
    "Lower / Raise existing equipment associated with pole change or clearance issues; HV Fuses/Pole Box/ABSW",
    "11kv ABSW Hookstick Standard",
    "11kv ABSW Hookstick Spring loaded mech",
    "33kv ABSW Hookstick Dependant",
    "Erect 11kV Remote Controlled Switch Disconnector ( Soule Auguste ) or Auto Reclosure unit c/w VT, Aerial, RTU & umbilical cable.",
    "11kV PMSW (Soule)",
    "ABC 2 core x 35mm² + 25mm² bare earth (250m drums)",
    "ABC 2 core x 35mm² (250m drums)",
    "ABC 2 core x 50mm² (250m drums)",
    "ABC 2 core x 95mm² (250m drums)",
    "ABC 2 core x 50mm² + 50mm² bare earth  (300m drums)",
    "ABC 4 core x 35mm² + 25mm² bare earth (250m drums)",
    "ABC 4 core x 35mm² (250m drums)",
    "ABC 4 core x 50mm² (250m drums)",
    "ABC 4 core x 95mm² (250m drums)",
    "ABC 4 core x 50mm² + 50mm² bare earth  (300m drums)",
    "ABC 4 core x 95mm² + 50mm² bare earth (300m drums)",
    "ABC 4 core x 120mm² + 50mm² bare earth",
    "Install conductor, run out, sag, terminate, clamp in and form jumper loops; >=200mm²",
    "Install conductor, run out, sag, terminate, clamp in and connect jumpers; 2c",
    "Install conductor, run out, sag, terminate, clamp in and connect jumpers; 4c",
    "Install conductor, run out, sag, terminate, clamp in and connect jumpers; 2c + Earth",
    "Install conductor, run out, sag, terminate, clamp in and connect jumpers; 4c + Earth"
]

transformer_keys = [
    "Transformer 1ph 50kVA", "Transformer 3ph 50kVA", "Erect pole mounted transformer up to 100kVA 1.ph.",
    "Erect pole mounted transformer up to 200kVA 3.p.h.", "Transformer 1ph 25kVA", "Transformer 3ph 200kVA",
    "Transformer 3ph 100kVA", "Single Pole Transformer Platform Steelwork", "'H' Pole Transformer Platform Steelwork"
]


# --- Dark purple/blue gradient background ---
gradient_bg = """
<style>
    .stApp {
        /* Gradient background */
        background: #291c42;
        background: linear-gradient(
            90deg,
            rgba(41, 28, 66, 1) 10%, 
            rgba(36, 57, 87, 1) 35%
        );
        background-size: cover;
        color: white;  /* Make text readable */
    }
</style>
"""
st.markdown(gradient_bg, unsafe_allow_html=True)

# --- Display Logo ---
logo = Image.open("C:\\Users\\Xavier.Mascarenhas\\OneDrive - Gaeltec Utilities Ltd\\Desktop\\Gaeltec\\01-Templates\\Images\\GaeltecImage.png")  # replace with your image path
logo = logo.resize((80, 80))  # Fixed size

# --- Display image and text side by side ---
col1, col2 = st.columns([1, 4])
with col1:
    st.image(logo)  # fixed size
with col2:
    st.markdown("<h1 style='margin:0; padding:0'> Gaeltec Utilities</h1>", unsafe_allow_html=True)# --- STREAMLIT DASHBOARD TITLE ---
st.markdown("<h1>📊 Data Management Dashboard</h1>", unsafe_allow_html=True)


# --- Upload Excel file ---
excel_file = st.file_uploader("Upload aggregated Excel file", type=["xlsx"])
if excel_file is not None:
    df = pd.read_excel(excel_file)

    # Standardize column names: lowercase, strip, make unique
    cols = pd.Series(df.columns)
    for dup in cols[cols.duplicated()].unique():
        dup_idx = cols[cols == dup].index.tolist()
        cols[dup_idx] = [f"{dup}_{i}" if i != 0 else dup for i in range(len(dup_idx))]
    df.columns = cols.str.strip().str.lower()

    # Ensure 'datetouse' column is datetime
    if 'datetouse' in df.columns:
        df['datetouse'] = pd.to_datetime(df['datetouse'], errors='coerce')
        df = df.dropna(subset=['datetouse'])
        df['datetouse'] = df['datetouse'].dt.normalize()  # remove time component

    # --- Sidebar Filters ---
    st.sidebar.header("Filter Options")

    # Project Manager Filter
    project_manager_selected = "All"
    if 'projectmanager' in df.columns:
        project_managers = ["All"] + sorted(df['projectmanager'].dropna().unique().tolist())
        project_manager_selected = st.sidebar.selectbox("Select Project Manager", project_managers)

    # Copy df for filtering
    filtered_df = df.copy()
    if project_manager_selected != "All":
        filtered_df = filtered_df[filtered_df['projectmanager'] == project_manager_selected]

    # Date filters
    filter_type = st.sidebar.selectbox(
        "Filter by Date",
        ["Single Day", "Week", "Month", "Year", "Custom Range"]
    )
    date_range_str = ""

    if filter_type == "Single Day":
        date_selected = st.sidebar.date_input("Select date")
        filtered_df = filtered_df[filtered_df['datetouse'] == pd.Timestamp(date_selected)]
        date_range_str = str(date_selected)

    elif filter_type == "Week":
        week_start = st.sidebar.date_input("Week start date")
        week_end = week_start + pd.Timedelta(days=6)
        filtered_df = filtered_df[
            (filtered_df['datetouse'] >= pd.Timestamp(week_start)) &
            (filtered_df['datetouse'] <= pd.Timestamp(week_end))
        ]
        date_range_str = f"{week_start} to {week_end}"

    elif filter_type == "Month":
        month_selected = st.sidebar.date_input("Pick any date in month")
        filtered_df = filtered_df[
            (filtered_df['datetouse'].dt.month == month_selected.month) &
            (filtered_df['datetouse'].dt.year == month_selected.year)
        ]
        date_range_str = month_selected.strftime("%B %Y")

    elif filter_type == "Year":
        year_selected = st.sidebar.number_input("Select year", min_value=2000, max_value=2100, value=2025)
        filtered_df = filtered_df[filtered_df['datetouse'].dt.year == year_selected]
        date_range_str = str(year_selected)

    elif filter_type == "Custom Range":
        start_date = st.sidebar.date_input("Start date")
        end_date = st.sidebar.date_input("End date")
        filtered_df = filtered_df[
            (filtered_df['datetouse'] >= pd.Timestamp(start_date)) &
            (filtered_df['datetouse'] <= pd.Timestamp(end_date))
        ]
        date_range_str = f"{start_date} to {end_date}"

    # --- Total Sum Calculation ---
    total_sum = 0
    if 'total' in filtered_df.columns and not filtered_df.empty:
        # Handle duplicate columns if any
        total_series = filtered_df['total']
        if isinstance(total_series, pd.DataFrame):
            total_series = total_series.iloc[:, 0]  # pick first column

        # Clean numeric values: remove spaces, replace commas, convert to float
        total_series = total_series.astype(str).str.replace(" ", "").str.replace(",", ".")
        total_series = pd.to_numeric(total_series, errors='coerce')
        total_sum = total_series.sum(skipna=True)

    formatted_total = f"Total:💲 {total_sum:,.2f}".replace(",", " ").replace(".", ",")

    # Display Total Sum
    st.markdown(
        f"<h3>{formatted_total} <br>({date_range_str}, {project_manager_selected})</h3>",
        unsafe_allow_html=True
    )

    # --- Mapping Categories ---
    st.header("Categories")
    category = st.radio(
        "Select mapping group:",
        ["Poles", "Equipment / Conductor", "Transformers"],
        horizontal=True
    )

    if 'mapped' not in filtered_df.columns:
        st.warning("No 'Mapped' column found in dataset.")
    else:
        if category == "Poles":
            keys = pole_keys
            title = "Pole Mappings"
        elif category == "Equipment / Conductor":
            keys = equipment_keys
            title = "Equipment / Conductor Mappings"
        else:
            keys = transformer_keys
            title = "Transformers Mappings"

        # Substring match using regex
        pattern = '|'.join([re.escape(k) for k in keys])
        mask = filtered_df['item'].astype(str).str.contains(pattern, case=False, na=False)
        sub_df = filtered_df[mask]

        if not sub_df.empty:
            bar_data = sub_df['mapped'].value_counts().reset_index()
            bar_data.columns = ['Mapped', 'Count']
            fig = px.bar(
                bar_data,
                x='Mapped',
                y='Count',
                labels={'Count': 'Number of Items', 'Mapped': 'Mapping'},
                title=f"{title} - Counts in Selected Dates"
            )
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info(f"No records found for {title} in the selected filters.")
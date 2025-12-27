import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  serverTimestamp, 
  query, 
  orderBy,
} from 'firebase/firestore';
import { 
  Plus, Trash2, Search, Package, Minus, Save, 
  Image as ImageIcon, Loader2, X, Check, AlertCircle, Edit3, ArrowLeft, AlignLeft, Move, LayoutGrid, MapPin, FolderInput, Camera, Edit2, ChevronLeft, ChevronRight, Building, Navigation, Layers, ChevronDown, Download 
} from 'lucide-react';

import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css'; 
import getCroppedImg from './cropUtils'; 

// --- THƯ VIỆN EXCEL (SHEETJS) ---
import * as XLSX from 'xlsx';

// --- CẤU HÌNH FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyDRFJjd4IsbFSJIuaAR1UgMnMB-gdnEwfo",
  authDomain: "xuanvinhlinhkien.firebaseapp.com",
  projectId: "xuanvinhlinhkien",
  storageBucket: "xuanvinhlinhkien.firebasestorage.app",
  messagingSenderId: "975808621358",
  appId: "1:975808621358:web:f30a0821cb87f8c2b228bf",
  measurementId: "G-KSE9WXBL18"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const ITEMS_COLLECTION = 'inventory_items';
const ZONES_COLLECTION = 'inventory_zones';

// --- CẤU HÌNH CLOUDINARY ---
const CLOUD_NAME = "dphexeute"; 
const UPLOAD_PRESET = "kho_linh_kien"; 

const ITEMS_PER_PAGE = 12;

export default function App() {
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [zones, setZones] = useState([]); 
  const [activeZone, setActiveZone] = useState('ALL'); 
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Form State
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemImage, setNewItemImage] = useState(''); 
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  
  // Zone State
  const [isZoneDropdownOpen, setIsZoneDropdownOpen] = useState(false);
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [editingZone, setEditingZone] = useState(null);
  const [zoneFormName, setZoneFormName] = useState('');
  const [zoneFormLocation, setZoneFormLocation] = useState('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);

  // Detail & Edit State
  const [selectedItem, setSelectedItem] = useState(null); 
  const [isEditingDetail, setIsEditingDetail] = useState(false); 
  const [editNameValue, setEditNameValue] = useState("");
  const [editDescValue, setEditDescValue] = useState(""); 
  const [tempDetailImage, setTempDetailImage] = useState(null); 

  // Quantity Edit State
  const [editingId, setEditingId] = useState(null); 
  const [editQtyValue, setEditQtyValue] = useState(0);

  // View State
  const [viewScale, setViewScale] = useState(1); 
  const [viewPosition, setViewPosition] = useState({ x: 0, y: 0 }); 
  const [isDraggingView, setIsDraggingView] = useState(false); 
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 }); 
  
  // Cropper State
  const [imageSrc, setImageSrc] = useState(null);
  const [crop, setCrop] = useState(); 
  const [completedCrop, setCompletedCrop] = useState(null);
  const [isCropping, setIsCropping] = useState(false);
  const [cropContext, setCropContext] = useState('ADD'); 
  const imgRef = useRef(null); 
  
  const dropdownRef = useRef(null);

  // Auth
  useEffect(() => {
    const initAuth = async () => {
      try { await signInAnonymously(auth); } 
      catch (err) { console.error(err); setError("Lỗi kết nối."); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsZoneDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownRef]);

  // --- DATA FETCHING ---
  useEffect(() => {
    if (!user) return;
    const qItems = query(collection(db, ITEMS_COLLECTION), orderBy('createdAt', 'desc'));
    const unsubItems = onSnapshot(qItems, (snapshot) => {
      const loadedItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setItems(loadedItems);
      setLoading(false);
      if (selectedItem) {
        const updatedItem = loadedItems.find(i => i.id === selectedItem.id);
        if (updatedItem && !isEditingDetail) {
             setSelectedItem(updatedItem);
        }
      }
    });
    const qZones = query(collection(db, ZONES_COLLECTION), orderBy('createdAt', 'asc'));
    const unsubZones = onSnapshot(qZones, (snapshot) => {
      const loadedZones = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setZones(loadedZones);
    });
    return () => { unsubItems(); unsubZones(); };
  }, [user, selectedItem, isEditingDetail]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeZone]);

  // --- LOGIC XUẤT EXCEL (DÙNG HÀM IMAGE) ---
  const handleExportExcel = () => {
    if (items.length === 0) {
      alert("Kho đang trống!"); return;
    }

    // 1. Chuẩn bị dữ liệu (Khớp với thứ tự cột bạn muốn)
    const dataToExport = items.map(item => {
      const zone = zones.find(z => z.id === item.zoneId);
      return {
        'Tên Linh Kiện': item.name,
        'Hình Ảnh': '', // Cột B: Để trống để lát chèn công thức
        'Số Lượng': item.quantity,
        'Thùng Chứa': zone ? zone.name : 'Chưa phân vùng',
        'Vị Trí': zone ? zone.location || 'Chưa cập nhật' : '---',
        'Link Ảnh Gốc': item.image // Cột F: Link gốc
      };
    });

    // 2. Tạo Worksheet
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);

    // --- CẤU HÌNH CỘT ---
    worksheet['!cols'] = [
      { wch: 30 }, // A: Tên
      { wch: 100 }, // B: Hình Ảnh (Preview)
      { wch: 10 }, // C: SL
      { wch: 20 }, // D: Thùng
      { wch: 25 }, // E: Vị trí
      { wch: 50 }, // F: Link Gốc
    ];

    // --- CẤU HÌNH DÒNG (Quan trọng: Phải cao lên để hiện ảnh) ---
    const rows = [{ hpt: 20 }]; // Header height
    // Duyệt qua từng dòng dữ liệu để set chiều cao và chèn công thức
    for (let i = 0; i < items.length; i++) {
      rows.push({ hpt: 80 }); // Data row height (80 points ~ 106 pixels)
      
      const rowIndex = i + 2; // Excel bắt đầu từ dòng 2
      const cellRef = `B${rowIndex}`; // Ô chứa ảnh
      const linkRef = `F${rowIndex}`; // Ô chứa link (Cột F)

      // Chèn công thức IMAGE vào cột B
      if (items[i].image) {
        worksheet[cellRef] = {
          t: 'f', // Type: Formula
          f: `_xlfn.IMAGE(TRIM(${linkRef}), "", 3, 500, 500)`, // Công thức thần thánh
          v: 'Loading Image...', // Giá trị hiển thị fallback
        };
      }
    }
    worksheet['!rows'] = rows;

    // 3. Tạo Workbook & Xuất
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Kho Linh Kien");
    const date = new Date().toISOString().slice(0,10);
    XLSX.writeFile(workbook, `Kho_Linh_Kien_${date}.xlsx`);
  };

  // --- LOGIC VÙNG (ZONES) ---
  const openAddZoneModal = () => {
    setEditingZone(null);
    setZoneFormName('');
    setZoneFormLocation('');
    setIsZoneModalOpen(true);
    setIsZoneDropdownOpen(false);
  };

  const openEditZoneModal = (zone, e) => {
    e.stopPropagation();
    setEditingZone(zone);
    setZoneFormName(zone.name);
    setZoneFormLocation(zone.location || '');
    setIsZoneModalOpen(true);
    setIsZoneDropdownOpen(false);
  };

  const handleSaveZone = async (e) => {
    e.preventDefault();
    if (!zoneFormName.trim()) return;
    try {
      if (editingZone) {
        await updateDoc(doc(db, ZONES_COLLECTION, editingZone.id), {
          name: zoneFormName.trim(),
          location: zoneFormLocation.trim()
        });
      } else {
        await addDoc(collection(db, ZONES_COLLECTION), {
          name: zoneFormName.trim(),
          location: zoneFormLocation.trim(),
          createdAt: serverTimestamp(),
          createdBy: user.uid
        });
      }
      setIsZoneModalOpen(false);
    } catch (err) {
      console.error(err);
      setError("Lỗi khi lưu khu vực.");
    }
  };

  const handleDeleteZone = async (zoneId, e) => {
    e.stopPropagation();
    if (window.confirm("Xóa vùng này? Sản phẩm sẽ chuyển về 'Chưa phân vùng'.")) { 
      try { 
        await deleteDoc(doc(db, ZONES_COLLECTION, zoneId)); 
        if(activeZone === zoneId) setActiveZone('ALL'); 
      } catch (e) { setError("Lỗi khi xóa vùng."); } 
    }
  };

  const handleChangeItemZone = async (itemId, newZoneId) => {
    try { const zoneValue = newZoneId === 'UNCATEGORIZED' ? null : newZoneId; await updateDoc(doc(db, ITEMS_COLLECTION, itemId), { zoneId: zoneValue }); } catch (e) { console.error(e); setError("Lỗi khi chuyển vùng sản phẩm."); }
  };

  // --- LOGIC VIEW ẢNH CHI TIẾT ---
  const handleDetailImageLoad = (e) => {
    const img = e.target;
    const container = img.parentElement; 
    const containerW = container.offsetWidth;
    const containerH = container.offsetHeight;
    const imgNaturalW = img.naturalWidth;
    const imgNaturalH = img.naturalHeight;
    const scaleX = containerW / imgNaturalW;
    const scaleY = containerH / imgNaturalH;
    let optimalScale = Math.max(scaleX, scaleY);
    if (optimalScale < 1) optimalScale = 1;
    setViewScale(optimalScale);
  };
  const handleViewMouseDown = (e) => { e.preventDefault(); setIsDraggingView(true); setDragStart({ x: e.clientX - viewPosition.x, y: e.clientY - viewPosition.y }); };
  const handleViewMouseMove = (e) => { if (!isDraggingView) return; e.preventDefault(); setViewPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); };
  const handleViewMouseUp = () => { setIsDraggingView(false); };

  // --- LOGIC UPLOAD & CROP ---
  function centerAspectCrop(mediaWidth, mediaHeight) { return centerCrop(makeAspectCrop({ unit: '%', width: 90 }, undefined, mediaWidth, mediaHeight), mediaWidth, mediaHeight) }

  const handleFileSelect = (e, context = 'ADD') => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) { setError("Ảnh quá lớn (>10MB)."); return; }
      const reader = new FileReader();
      reader.addEventListener('load', () => { 
        setImageSrc(reader.result); 
        setIsCropping(true); 
        setCropContext(context);
        setError(''); 
      });
      reader.readAsDataURL(file);
    }
  };

  const handlePaste = (e) => {
    if (!isFormOpen && !isEditingDetail) return;
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        const reader = new FileReader();
        reader.addEventListener('load', () => { 
          setImageSrc(reader.result); 
          setIsCropping(true); 
          setCropContext(isEditingDetail ? 'EDIT' : 'ADD');
          setError(''); 
        });
        reader.readAsDataURL(file);
        e.preventDefault(); break;
      }
    }
  };

  const onImageLoad = (e) => {
    const { width, height } = e.currentTarget;
    imgRef.current = e.currentTarget;
    const initialCrop = centerAspectCrop(width, height);
    setCrop(initialCrop);
    setCompletedCrop(initialCrop); 
  };

  const showCroppedImage = async () => {
    if (!completedCrop || !imgRef.current || completedCrop.width === 0 || completedCrop.height === 0) {
      if (cropContext === 'ADD') setNewItemImage(imageSrc);
      else setTempDetailImage(imageSrc);
      setIsCropping(false); setImageSrc(null); return;
    }
    try { 
      const base64 = await getCroppedImg(imgRef.current, completedCrop, 'newFile.jpeg'); 
      if (cropContext === 'ADD') setNewItemImage(base64);
      else setTempDetailImage(base64);
      setIsCropping(false); setImageSrc(null); 
    } catch (e) { 
      if (cropContext === 'ADD') setNewItemImage(imageSrc);
      else setTempDetailImage(imageSrc);
      setIsCropping(false); setImageSrc(null);
    }
  };

  const uploadToCloudinary = async (base64) => {
    const formData = new FormData(); formData.append("file", base64); formData.append("upload_preset", UPLOAD_PRESET);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: formData });
    if (!res.ok) throw new Error("Lỗi upload"); const data = await res.json(); return data.secure_url;
  };

  // --- CRUD ITEM ---
  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!newItemName.trim() || !user) return;
    const normalizedNewName = newItemName.trim().toLowerCase();
    if (items.some(item => item.name.toLowerCase() === normalizedNewName)) { setError("Tên linh kiện đã tồn tại!"); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setIsUploading(true);
    try {
      let finalImageUrl = 'https://via.placeholder.com/300?text=No+Image'; 
      if (newItemImage && newItemImage.startsWith('data:image')) { finalImageUrl = await uploadToCloudinary(newItemImage); }
      else if (newItemImage) { finalImageUrl = newItemImage; }
      await addDoc(collection(db, ITEMS_COLLECTION), {
        name: newItemName, quantity: parseInt(newItemQty), image: finalImageUrl, description: "", zoneId: activeZone === 'ALL' || activeZone === 'UNCATEGORIZED' ? null : activeZone, createdAt: serverTimestamp(), createdBy: user.uid
      });
      setNewItemName(''); setNewItemQty(1); setNewItemImage(''); setIsFormOpen(false); setError('');
    } catch (err) { setError("Lỗi khi lưu."); } finally { setIsUploading(false); }
  };

  const handleDeleteItem = async (id) => { if (window.confirm("Xóa linh kiện này?")) { try { await deleteDoc(doc(db, ITEMS_COLLECTION, id)); setSelectedItem(null); } catch (err) { setError("Lỗi xóa."); } } };
  
  const startEditingQty = (item) => { setEditingId(item.id); setEditQtyValue(item.quantity); };
  const handleEditQtyChange = (val) => { const v = parseInt(val); if (!isNaN(v) && v >= 0) setEditQtyValue(v); else if (val === "") setEditQtyValue(""); };
  const saveQuantity = async (id) => { if (editQtyValue === "" || editQtyValue < 0) { alert("Số lượng sai!"); return; } try { await updateDoc(doc(db, ITEMS_COLLECTION, id), { quantity: parseInt(editQtyValue) }); setEditingId(null); } catch (err) {} };
  
  const openDetail = (item) => { 
    setSelectedItem(item); setEditDescValue(item.description || ""); setEditNameValue(item.name); setTempDetailImage(null); setIsEditingDetail(false); setViewPosition({x:0, y:0}); 
  };

  const handleSaveDetailChanges = async () => {
    if (!selectedItem || !user) return;
    if (!editNameValue.trim()) { alert("Tên không được để trống"); return; }
    setIsUploading(true);
    try {
      let finalImageUrl = selectedItem.image;
      if (tempDetailImage && tempDetailImage.startsWith('data:image')) { finalImageUrl = await uploadToCloudinary(tempDetailImage); }
      await updateDoc(doc(db, ITEMS_COLLECTION, selectedItem.id), { name: editNameValue.trim(), description: editDescValue, image: finalImageUrl });
      setSelectedItem(prev => ({ ...prev, name: editNameValue.trim(), description: editDescValue, image: finalImageUrl }));
      setIsEditingDetail(false); setTempDetailImage(null);
    } catch (e) { console.error(e); setError("Lỗi khi lưu thông tin."); } finally { setIsUploading(false); }
  };

  // --- LOGIC PHÂN TRANG ---
  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    let matchesZone = true;
    if (activeZone === 'ALL') matchesZone = true;
    else if (activeZone === 'UNCATEGORIZED') matchesZone = !item.zoneId || item.zoneId === null;
    else matchesZone = item.zoneId === activeZone;
    return matchesSearch && matchesZone;
  });

  const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
  const currentItems = filteredItems.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);

  const paginate = (pageNumber) => {
    setCurrentPage(pageNumber);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const activeZoneName = activeZone === 'ALL' 
    ? 'Tất cả thùng chứa' 
    : (zones.find(z => z.id === activeZone)?.name || 'Không xác định');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-10" onPaste={handlePaste}>
      
      {/* --- MODAL TẠO/SỬA VÙNG --- */}
      {isZoneModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex justify-center items-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md animate-in zoom-in-95">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><MapPin className="text-blue-600"/>{editingZone ? 'Chỉnh sửa khu vực' : 'Tạo khu vực mới'}</h2>
            <form onSubmit={handleSaveZone} className="space-y-4">
              <div><label className="block text-sm font-bold text-slate-500 mb-1">Tên khu vực</label><input type="text" value={zoneFormName} onChange={(e) => setZoneFormName(e.target.value)} className="w-full border-2 border-slate-200 rounded-xl px-4 py-2 focus:border-blue-500 outline-none font-bold" placeholder="Nhập tên..." required /></div>
              <div><label className="block text-sm font-bold text-slate-500 mb-1">Vị trí chi tiết</label><div className="relative"><input type="text" value={zoneFormLocation} onChange={(e) => setZoneFormLocation(e.target.value)} className="w-full border-2 border-slate-200 rounded-xl px-4 py-2 pl-10 focus:border-blue-500 outline-none" placeholder="Mô tả vị trí..." /><Building size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/></div></div>
              <div className="flex gap-3 mt-6"><button type="button" onClick={() => setIsZoneModalOpen(false)} className="flex-1 py-3 rounded-xl bg-slate-100 font-bold text-slate-600 hover:bg-slate-200">Hủy</button><button type="submit" className="flex-1 py-3 rounded-xl bg-blue-600 font-bold text-white hover:bg-blue-700 shadow-lg">Lưu lại</button></div>
            </form>
          </div>
        </div>
      )}

      {/* --- CHI TIẾT SẢN PHẨM --- */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto animate-in slide-in-from-right duration-300">
          <div className="max-w-5xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between mb-6 sticky top-0 bg-white/95 backdrop-blur py-4 border-b border-slate-100 z-10">
              <button onClick={() => setSelectedItem(null)} className="flex items-center gap-2 text-slate-500 hover:text-blue-600 font-bold transition">
                <ArrowLeft size={24}/> Quay lại
              </button>
              
              <div className="flex gap-3">
                {!isEditingDetail ? (
                  <>
                    <button onClick={() => setIsEditingDetail(true)} className="bg-blue-100 text-blue-600 px-4 py-2 rounded-lg font-bold flex gap-2 items-center hover:bg-blue-200 transition">
                      <Edit3 size={20}/> Sửa thông tin
                    </button>
                    <button onClick={() => handleDeleteItem(selectedItem.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg font-bold flex gap-1 items-center transition"><Trash2 size={20}/></button>
                  </>
                ) : (
                  <>
                    <button onClick={handleSaveDetailChanges} disabled={isUploading} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold flex gap-2 items-center hover:bg-blue-700 transition shadow-lg disabled:opacity-50"><Save size={20}/> {isUploading ? 'Đang lưu...' : 'Lưu lại'}</button>
                    <button onClick={() => { setIsEditingDetail(false); setTempDetailImage(null); setEditNameValue(selectedItem.name); setEditDescValue(selectedItem.description || ""); }} disabled={isUploading} className="bg-slate-200 text-slate-600 px-4 py-2 rounded-lg font-bold hover:bg-slate-300 transition">Hủy</button>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="relative group">
                <div className={`bg-slate-50 rounded-3xl overflow-hidden border border-slate-200 shadow-inner h-[400px] lg:h-[600px] relative ${!isEditingDetail ? 'cursor-grab active:cursor-grabbing' : ''}`} onMouseDown={!isEditingDetail ? handleViewMouseDown : undefined} onMouseMove={!isEditingDetail ? handleViewMouseMove : undefined} onMouseUp={!isEditingDetail ? handleViewMouseUp : undefined} onMouseLeave={!isEditingDetail ? handleViewMouseUp : undefined}>
                  <img src={tempDetailImage || selectedItem.image} alt="Detail" onLoad={handleDetailImageLoad} className={`absolute top-1/2 left-1/2 max-w-none transition-transform duration-75 ease-out ${isEditingDetail ? 'opacity-80 blur-[2px]' : ''}`} draggable="false" style={{ transform: `translate(-50%, -50%) scale(${viewScale}) translate(${viewPosition.x / viewScale}px, ${viewPosition.y / viewScale}px)` }} />
                  {isEditingDetail && (<label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer bg-black/20 hover:bg-black/30 transition z-20"><div className="bg-white p-4 rounded-full shadow-2xl mb-2"><Camera size={32} className="text-blue-600"/></div><span className="font-bold text-white text-lg shadow-black drop-shadow-md">Thay đổi ảnh</span><input type="file" accept="image/*" onChange={(e) => handleFileSelect(e, 'EDIT')} className="hidden" /></label>)}
                </div>
              </div>
              
              <div className="flex flex-col">
                <div className="mb-4">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Tên sản phẩm</label>
                  {isEditingDetail ? (<input type="text" value={editNameValue} onChange={(e) => setEditNameValue(e.target.value)} className="w-full text-3xl md:text-4xl font-bold text-slate-800 border-b-2 border-blue-500 focus:outline-none bg-transparent py-2" />) : (<h1 className="text-3xl md:text-4xl font-bold text-slate-800">{selectedItem.name}</h1>)}
                </div>
                <p className="text-sm text-slate-400 font-mono mb-4">ID: {selectedItem.id}</p>
                <div className="mb-6"><label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1"><FolderInput size={14}/> Khu vực lưu trữ</label><div className="relative"><select value={selectedItem.zoneId || 'UNCATEGORIZED'} onChange={(e) => handleChangeItemZone(selectedItem.id, e.target.value)} className="w-full bg-white border-2 border-slate-200 text-slate-700 font-bold py-3 pl-4 pr-10 rounded-xl appearance-none focus:outline-none focus:border-blue-500 transition cursor-pointer"><option value="UNCATEGORIZED">⚠️ Chưa phân vùng</option>{zones.map(zone => (<option key={zone.id} value={zone.id}>📍 {zone.name} ({zone.location || 'N/A'})</option>))}</select><div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-slate-500"><MapPin size={18} /></div></div></div>
                <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 mb-8"><span className="text-xs font-bold text-blue-400 uppercase tracking-widest block mb-2">Tồn kho hiện tại</span><div className="flex items-center gap-4">{editingId === selectedItem.id ? (<div className="flex items-center gap-2"><button onClick={() => setEditQtyValue(prev => (prev <= 0 ? 0 : prev - 1))} className="w-10 h-10 bg-white rounded flex items-center justify-center border hover:bg-red-50 text-red-500"><Minus size={14}/></button><input type="number" value={editQtyValue} onChange={(e) => handleEditQtyChange(e.target.value)} className="w-20 text-center font-mono font-bold text-3xl bg-transparent border-b-2 border-blue-500 outline-none" /><button onClick={() => setEditQtyValue(prev => prev + 1)} className="w-8 h-8 bg-white rounded flex items-center justify-center border hover:bg-green-50 text-green-500"><Plus size={14}/></button><button onClick={() => saveQuantity(selectedItem.id)} className="ml-2 bg-blue-600 text-white p-2 rounded hover:bg-blue-700"><Check size={16}/></button><button onClick={() => setEditingId(null)} className="bg-slate-200 p-2 rounded hover:bg-slate-300"><X size={16}/></button></div>) : (<><span className="text-5xl font-mono font-bold text-blue-600">{selectedItem.quantity}</span><span className="text-slate-500 font-medium">cái</span><button onClick={() => startEditingQty(selectedItem)} className="ml-4 text-blue-400 hover:text-blue-600"><Edit3 size={20}/></button></>)}</div></div>
                <div className="flex-1"><div className="flex items-center justify-between mb-3"><h2 className="text-xl font-bold flex items-center gap-2 text-slate-700"><AlignLeft size={24}/> Mô tả chi tiết</h2></div>{isEditingDetail ? (<div className="animate-in fade-in"><textarea className="w-full h-64 p-4 border-2 border-blue-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg leading-relaxed text-slate-700" value={editDescValue} onChange={(e) => setEditDescValue(e.target.value)} placeholder="Nhập thông số kỹ thuật..."></textarea></div>) : (<div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm max-h-[400px] overflow-y-auto">{selectedItem.description ? (<p className="whitespace-pre-wrap text-lg text-slate-600 leading-relaxed">{selectedItem.description}</p>) : (<p className="text-slate-400 italic text-center py-10">Chưa có mô tả nào cho sản phẩm này.</p>)}</div>)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- HEADER CHÍNH --- */}
      <header className="bg-blue-600 text-white shadow-lg sticky top-0 z-20 px-4 pt-4 pb-4">
        <div className="flex justify-between items-center mb-0">
          <div className="flex items-center gap-2">
            <Package className="w-8 h-8" />
            <h1 className="text-xl md:text-2xl font-bold hidden sm:block">Kho Linh Kiện</h1>
          </div>

          <div className="relative mx-2 flex-1 max-w-md flex gap-2">
            {/* DROPDOWN MENU */}
            <div className="relative flex-1" ref={dropdownRef}>
              <button 
                onClick={() => setIsZoneDropdownOpen(!isZoneDropdownOpen)}
                className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-between transition border border-blue-500 shadow-inner"
              >
                <span className="flex items-center gap-2 truncate">
                  <Layers size={18} />
                  {activeZoneName}
                </span>
                <ChevronDown size={18} className={`transition-transform duration-200 ${isZoneDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isZoneDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-slate-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 text-slate-800">
                  <button onClick={() => { setActiveZone('ALL'); setIsZoneDropdownOpen(false); setIsFormOpen(false); }} className={`w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-3 border-b border-slate-100 ${activeZone === 'ALL' ? 'bg-blue-50 text-blue-600' : ''}`}>
                    <div className="p-2 bg-slate-100 rounded-full"><LayoutGrid size={16}/></div><span className="font-bold">Tất cả thùng chứa</span>
                  </button>
                  <div className="max-h-[300px] overflow-y-auto">
                    {zones.length === 0 ? (<div className="p-4 text-center text-slate-400 text-sm">Chưa có vùng nào</div>) : (zones.map(zone => (
                      <div key={zone.id} className={`group flex items-center justify-between px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-0 ${activeZone === zone.id ? 'bg-blue-50' : ''}`}>
                        <button onClick={() => { setActiveZone(zone.id); setIsZoneDropdownOpen(false); setIsFormOpen(false); }} className="flex-1 flex items-center gap-3 text-left">
                          <div className={`p-2 rounded-full ${activeZone === zone.id ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}><MapPin size={16}/></div>
                          <div><div className={`font-bold ${activeZone === zone.id ? 'text-blue-700' : 'text-slate-700'}`}>{zone.name}</div>{zone.location && <div className="text-xs text-slate-400 flex items-center gap-1"><Building size={10}/> {zone.location}</div>}</div>
                        </button>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => openEditZoneModal(zone, e)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={16}/></button>
                          <button onClick={(e) => handleDeleteZone(zone.id, e)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><X size={16}/></button>
                        </div>
                      </div>
                    )))}
                  </div>
                  <div className="p-2 bg-slate-50 border-t border-slate-100"><button onClick={openAddZoneModal} className="w-full flex justify-center items-center gap-2 bg-white border border-slate-200 py-2.5 rounded-lg font-bold text-blue-600 hover:bg-blue-50 transition"><Plus size={18}/> Tạo khu vực mới</button></div>
                </div>
              )}
            </div>

            {/* EXPORT BUTTON */}
            <button 
              onClick={handleExportExcel}
              className="bg-blue-700 hover:bg-blue-800 text-white p-2.5 rounded-xl border border-blue-500 shadow-inner flex items-center justify-center"
              title="Xuất Excel"
            >
              <Download size={20}/>
            </button>
          </div>

          {activeZone !== 'ALL' && (
            <button onClick={() => setIsFormOpen(!isFormOpen)} className="bg-white text-blue-600 px-4 py-2.5 rounded-xl font-bold flex gap-2 shadow-sm hover:bg-blue-50 transition whitespace-nowrap">
              {isFormOpen ? <Minus size={20} /> : <Plus size={20} />} <span className="hidden sm:inline">{isFormOpen ? 'Đóng' : 'Thêm Mới'}</span>
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {error && <div className="mb-4 bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded flex items-center gap-2"><AlertCircle size={20} /><p>{error}</p></div>}
        {(loading || isUploading) && (<div className="fixed inset-0 bg-black/30 z-50 flex justify-center items-center backdrop-blur-sm"><div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center"><Loader2 className="animate-spin text-blue-600 w-12 h-12 mb-3" /><p className="font-bold text-lg text-slate-700">{isUploading ? "Đang xử lý ảnh..." : "Đang tải..."}</p></div></div>)}

        {isCropping && (
          <div className="fixed inset-0 z-[60] bg-black/80 flex justify-center items-center p-4">
             <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden">
                <div className="p-4 bg-slate-100 border-b flex justify-between items-center"><h3 className="font-bold text-lg">Cắt ảnh ({cropContext === 'ADD' ? 'Thêm mới' : 'Cập nhật'})</h3><button onClick={() => setIsCropping(false)}><X/></button></div>
                <div className="p-4 bg-slate-900 flex justify-center max-h-[60vh]"><ReactCrop crop={crop} onChange={(_, percentCrop) => setCrop(percentCrop)} onComplete={(c) => setCompletedCrop(c)} aspect={undefined} minWidth={20} minHeight={20}><img src={imageSrc} alt="Upload" onLoad={onImageLoad} style={{ maxHeight: '60vh', maxWidth: '100%', objectFit: 'contain' }} /></ReactCrop></div>
                <div className="p-4 flex gap-4"><button onClick={() => setIsCropping(false)} className="flex-1 py-3 rounded-xl font-bold bg-slate-200 text-slate-700">Hủy</button><button onClick={showCroppedImage} className="flex-1 py-3 rounded-xl font-bold bg-green-600 text-white">Xong</button></div>
             </div>
          </div>
        )}

        {isFormOpen && activeZone !== 'ALL' && (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-8 border border-slate-200 animate-in slide-in-from-top-4" onPaste={handlePaste}>
            <div className="flex justify-between items-center mb-6"><h2 className="font-bold text-2xl text-slate-800">Thêm vào: {zones.find(z => z.id === activeZone)?.name}</h2><span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">Hỗ trợ dán ảnh (Ctrl+V)</span></div>
            <form onSubmit={handleAddItem} className="space-y-6">
              <div><label className="block text-base font-bold mb-2 text-slate-700">Tên linh kiện</label><input type="text" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className="w-full px-5 py-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:ring-0 outline-none text-lg" required placeholder="Nhập tên..." /></div>
              <div className="flex gap-6"><div className="w-1/3"><label className="block text-base font-bold mb-2 text-slate-700">Số lượng</label><input type="number" value={newItemQty} onChange={(e) => setNewItemQty(e.target.value)} className="w-full px-5 py-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none text-lg font-mono" min="0" /></div><div className="w-2/3"><label className="block text-base font-bold mb-2 text-slate-700">Hình ảnh</label>{newItemImage ? (<div className="relative h-64 w-full bg-slate-50 rounded-xl overflow-hidden border-2 border-slate-300 group"><img src={newItemImage} alt="Preview" className="w-full h-full object-cover" /><button type="button" onClick={() => setNewItemImage('')} className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full shadow-lg hover:bg-red-600 transition"><Trash2 size={20}/></button></div>) : (<label className="cursor-pointer bg-slate-50 hover:bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center h-64 text-slate-500 transition hover:border-blue-400 hover:text-blue-500"><ImageIcon size={40} className="mb-2 opacity-50"/><span className="text-sm font-bold">Bấm chọn hoặc dán (Ctrl+V)</span><input type="file" accept="image/*" onChange={(e) => handleFileSelect(e, 'ADD')} className="hidden" /></label>)}</div></div>
              <button type="submit" disabled={isUploading} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 shadow-lg transition flex justify-center items-center gap-2 disabled:bg-slate-400 text-lg"><Save size={24} /> {isUploading ? "Đang lưu..." : "Lưu vào kho"}</button>
            </form>
          </div>
        )}

        {/* --- BANNER VỊ TRÍ --- */}
        {activeZone !== 'ALL' && activeZone !== 'UNCATEGORIZED' && (() => {
          const currentZone = zones.find(z => z.id === activeZone);
          if (currentZone && currentZone.location) {
            return (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 p-4 rounded-xl mb-6 flex items-center gap-4 shadow-sm animate-in fade-in slide-in-from-top-2">
                <div className="bg-white p-3 rounded-full shadow-sm text-blue-600"><Navigation size={24} /></div>
                <div><p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-0.5">Vị trí lưu trữ</p><p className="text-lg font-bold text-slate-700 flex items-center gap-2">{currentZone.location}</p></div>
              </div>
            );
          }
          return null;
        })()}

        <div className="relative mb-8"><input type="text" placeholder={`Tìm kiếm trong ${activeZone === 'ALL' ? 'tất cả kho' : 'vùng này'}...`} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-6 py-4 rounded-full border border-slate-200 shadow-md focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none text-lg" /><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-6 h-6" /></div>

        {!loading && filteredItems.length === 0 ? (
          <div className="text-center py-16 text-slate-400 bg-white rounded-3xl border-2 border-dashed border-slate-200"><Package className="w-16 h-16 mx-auto mb-4 opacity-30" /><p className="text-xl font-medium">{activeZone === 'ALL' ? 'Kho chưa có gì cả' : 'Khu vực này đang trống'}</p>{activeZone !== 'ALL' && (<p className="text-sm mt-2 text-blue-500 cursor-pointer hover:underline" onClick={() => setIsFormOpen(true)}>Thêm món đầu tiên ngay</p>)}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">{currentItems.map((item) => (<div key={item.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col hover:shadow-xl transition-shadow duration-300"><div onClick={() => openDetail(item)} className="h-80 w-full bg-white relative group border-b border-slate-50 p-4 cursor-pointer"><img src={item.image} alt={item.name} className="w-full h-full object-cover rounded-lg transition-transform duration-500 group-hover:scale-105" onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/300x400?text=No+Image'; }} /></div><div className="p-5 flex-1 flex flex-col justify-between"><div className="mb-4"><h3 onClick={() => openDetail(item)} className="font-bold text-slate-800 text-2xl line-clamp-2 leading-tight mb-1 cursor-pointer hover:text-blue-600 transition">{item.name}</h3>{activeZone === 'ALL' && (<span className="text-xs font-bold px-2 py-1 bg-slate-100 text-slate-500 rounded-full">{zones.find(z => z.id === item.zoneId)?.name || 'Chưa phân vùng'}</span>)}</div><div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100 min-h-[60px]">{editingId === item.id ? (<div className="flex items-center justify-between w-full animate-in fade-in duration-200 gap-2"><button onClick={() => setEditQtyValue(prev => (prev === "" || prev <= 0 ? 0 : prev - 1))} className="w-10 h-10 flex-shrink-0 bg-white border border-red-200 rounded-lg flex items-center justify-center hover:bg-red-50 text-red-500 shadow-sm transition"><Minus size={18}/></button><input type="number" value={editQtyValue} onChange={(e) => handleEditQtyChange(e.target.value)} className="w-full h-10 text-center font-mono font-bold text-2xl bg-white border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800" /><button onClick={() => setEditQtyValue(prev => (prev === "" ? 1 : prev + 1))} className="w-10 h-10 flex-shrink-0 bg-white border border-green-200 rounded-lg flex items-center justify-center hover:bg-green-50 text-green-600 shadow-sm transition"><Plus size={18}/></button><button onClick={() => saveQuantity(item.id)} className="w-10 h-10 flex-shrink-0 bg-blue-600 text-white rounded-lg flex items-center justify-center shadow-md hover:bg-blue-700 transition"><Check size={18}/></button><button onClick={() => setEditingId(null)} className="w-10 h-10 flex-shrink-0 bg-slate-200 text-slate-500 rounded-lg flex items-center justify-center hover:bg-slate-300 transition"><X size={18}/></button></div>) : (<div className="flex items-center justify-between w-full"><div className="flex flex-col"><span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Số lượng</span><span className={`font-mono font-bold text-3xl ${item.quantity === 0 ? 'text-red-500' : 'text-blue-600'}`}>{item.quantity}</span></div><button onClick={() => startEditingQty(item)} className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition flex items-center gap-2"><Edit3 size={16}/> Sửa</button></div>)}</div></div></div>))}</div>
            {totalPages > 1 && (
              <div className="flex justify-center mt-12 gap-2">
                <button onClick={() => paginate(currentPage - 1)} disabled={currentPage === 1} className="p-2 rounded-lg bg-white border hover:bg-slate-50 disabled:opacity-50"><ChevronLeft size={20}/></button>
                {Array.from({ length: totalPages }, (_, i) => (
                  <button key={i + 1} onClick={() => paginate(i + 1)} className={`w-10 h-10 rounded-lg font-bold ${currentPage === i + 1 ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{i + 1}</button>
                ))}
                <button onClick={() => paginate(currentPage + 1)} disabled={currentPage === totalPages} className="p-2 rounded-lg bg-white border hover:bg-slate-50 disabled:opacity-50"><ChevronRight size={20}/></button>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="max-w-4xl mx-auto px-4 py-10 text-center text-slate-400 text-sm"><p>© {new Date().getFullYear()} Quản Lý Kho Linh Kiện</p><p className="text-xs mt-1">Lưu trữ: Firebase & Cloudinary</p></footer>
    </div>
  );
}
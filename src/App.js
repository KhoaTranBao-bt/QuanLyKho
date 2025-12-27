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
  Image as ImageIcon, Loader2, X, Check, AlertCircle, Edit3, ArrowLeft, AlignLeft, Move, LayoutGrid, MapPin 
} from 'lucide-react';

import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css'; 
import getCroppedImg from './cropUtils'; 

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
  
  // Edit & Detail State
  const [editingId, setEditingId] = useState(null); 
  const [editQtyValue, setEditQtyValue] = useState(0);
  const [selectedItem, setSelectedItem] = useState(null); 
  const [isEditingDesc, setIsEditingDesc] = useState(false); 
  const [descValue, setDescValue] = useState(""); 

  // Image View State
  const [viewScale, setViewScale] = useState(1); 
  const [viewPosition, setViewPosition] = useState({ x: 0, y: 0 }); 
  const [isDraggingView, setIsDraggingView] = useState(false); 
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 }); 
  
  // Cropper State
  const [imageSrc, setImageSrc] = useState(null);
  // Khởi tạo crop mặc định rỗng để tránh lỗi tính toán ban đầu
  const [crop, setCrop] = useState(); 
  const [completedCrop, setCompletedCrop] = useState(null);
  const [isCropping, setIsCropping] = useState(false);
  const imgRef = useRef(null); 

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
        if (updatedItem) setSelectedItem(updatedItem);
      }
    });
    const qZones = query(collection(db, ZONES_COLLECTION), orderBy('createdAt', 'asc'));
    const unsubZones = onSnapshot(qZones, (snapshot) => {
      const loadedZones = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setZones(loadedZones);
    });
    return () => { unsubItems(); unsubZones(); };
  }, [user, selectedItem]);

  // --- LOGIC VÙNG (ZONES) ---
  const handleAddZone = async () => {
    const zoneName = window.prompt("Nhập tên khu vực mới:");
    if (zoneName && zoneName.trim()) {
      try {
        await addDoc(collection(db, ZONES_COLLECTION), {
          name: zoneName.trim(), createdAt: serverTimestamp(), createdBy: user.uid
        });
      } catch (e) { setError("Không tạo được vùng."); }
    }
  };

  const handleDeleteZone = async (zoneId, e) => {
    e.stopPropagation();
    if (window.confirm("Xóa vùng này? Sản phẩm sẽ chuyển về 'Chưa phân vùng'.")) {
      try { await deleteDoc(doc(db, ZONES_COLLECTION, zoneId)); }
      catch (e) { setError("Lỗi khi xóa vùng."); }
    }
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

  // --- LOGIC UPLOAD & CROP (ĐÃ FIX LỖI MOBILE) ---
  
  // 1. Hàm helper để tạo crop full ảnh
  function centerAspectCrop(mediaWidth, mediaHeight) {
    return centerCrop(
      makeAspectCrop(
        {
          unit: '%',
          width: 90, // Mặc định chọn 90% ảnh
        },
        undefined, // Tự do tỷ lệ
        mediaWidth,
        mediaHeight,
      ),
      mediaWidth,
      mediaHeight,
    )
  }

  const onFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) { setError("Ảnh quá lớn (>10MB)."); return; }
      const reader = new FileReader();
      reader.addEventListener('load', () => { 
        setImageSrc(reader.result); 
        setIsCropping(true); 
        setError(''); 
        // Không setCrop ngay ở đây, để onLoad xử lý chính xác theo kích thước thật
      });
      reader.readAsDataURL(file);
    }
  };

  const handlePaste = (e) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        const reader = new FileReader();
        reader.addEventListener('load', () => { setImageSrc(reader.result); setIsCropping(true); setError(''); });
        reader.readAsDataURL(file);
        e.preventDefault(); break;
      }
    }
  };

  // 2. Sự kiện khi ảnh Load vào Cropper (FIX QUAN TRỌNG)
  const onImageLoad = (e) => {
    const { width, height } = e.currentTarget;
    imgRef.current = e.currentTarget;
    
    // Tự động tạo vùng chọn mặc định ngay khi ảnh load
    // Điều này ngăn completedCrop bị null
    const initialCrop = centerAspectCrop(width, height);
    setCrop(initialCrop);
    setCompletedCrop(initialCrop); // Set luôn completedCrop ban đầu
  };

  const showCroppedImage = async () => {
    // FIX: Kiểm tra kỹ nếu không có completedCrop hoặc width/height = 0
    // Thì dùng luôn ảnh gốc (Fallback) -> Tránh lỗi đỏ
    if (
      !completedCrop || 
      !imgRef.current || 
      completedCrop.width === 0 || 
      completedCrop.height === 0
    ) {
      setNewItemImage(imageSrc); // Dùng ảnh gốc
      setIsCropping(false);
      setImageSrc(null);
      return;
    }

    try { 
      const base64 = await getCroppedImg(imgRef.current, completedCrop, 'newFile.jpeg'); 
      setNewItemImage(base64); 
      setIsCropping(false); 
      setImageSrc(null); 
    } catch (e) { 
      // Nếu lỗi vẫn xảy ra, fallback về ảnh gốc luôn
      console.error(e);
      setNewItemImage(imageSrc);
      setIsCropping(false);
      setImageSrc(null);
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
    if (items.some(item => item.name.toLowerCase() === normalizedNewName)) {
      setError("Tên linh kiện đã tồn tại!"); window.scrollTo({ top: 0, behavior: 'smooth' }); return;
    }

    setIsUploading(true);
    try {
      let finalImageUrl = 'https://via.placeholder.com/300?text=No+Image'; 
      if (newItemImage && newItemImage.startsWith('data:image')) { finalImageUrl = await uploadToCloudinary(newItemImage); }
      else if (newItemImage) { finalImageUrl = newItemImage; }

      await addDoc(collection(db, ITEMS_COLLECTION), {
        name: newItemName,
        quantity: parseInt(newItemQty),
        image: finalImageUrl,
        description: "",
        zoneId: activeZone === 'ALL' || activeZone === 'UNCATEGORIZED' ? null : activeZone,
        createdAt: serverTimestamp(),
        createdBy: user.uid
      });
      setNewItemName(''); setNewItemQty(1); setNewItemImage(''); setIsFormOpen(false); setError('');
    } catch (err) { setError("Lỗi khi lưu."); } finally { setIsUploading(false); }
  };

  const handleDeleteItem = async (id) => { if (window.confirm("Xóa linh kiện này?")) { try { await deleteDoc(doc(db, ITEMS_COLLECTION, id)); setSelectedItem(null); } catch (err) { setError("Lỗi xóa."); } } };
  
  const startEditingQty = (item) => { setEditingId(item.id); setEditQtyValue(item.quantity); };
  const handleEditQtyChange = (val) => { const v = parseInt(val); if (!isNaN(v) && v >= 0) setEditQtyValue(v); else if (val === "") setEditQtyValue(""); };
  const saveQuantity = async (id) => { if (editQtyValue === "" || editQtyValue < 0) { alert("Số lượng sai!"); return; } try { await updateDoc(doc(db, ITEMS_COLLECTION, id), { quantity: parseInt(editQtyValue) }); setEditingId(null); } catch (err) {} };
  const openDetail = (item) => { setSelectedItem(item); setDescValue(item.description || ""); setIsEditingDesc(false); setViewPosition({x:0, y:0}); };
  const saveDescription = async () => { if (!selectedItem) return; try { await updateDoc(doc(db, ITEMS_COLLECTION, selectedItem.id), { description: descValue }); setIsEditingDesc(false); } catch (err) { setError("Lỗi lưu mô tả."); } };

  // --- FILTERING ---
  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    let matchesZone = true;
    if (activeZone === 'ALL') matchesZone = true;
    else if (activeZone === 'UNCATEGORIZED') matchesZone = !item.zoneId || item.zoneId === null;
    else matchesZone = item.zoneId === activeZone;
    return matchesSearch && matchesZone;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-10">
      
      {/* --- CHI TIẾT SẢN PHẨM --- */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto animate-in slide-in-from-right duration-300">
          <div className="max-w-5xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between mb-6 sticky top-0 bg-white/95 backdrop-blur py-4 border-b border-slate-100 z-10">
              <button onClick={() => setSelectedItem(null)} className="flex items-center gap-2 text-slate-500 hover:text-blue-600 font-bold transition">
                <ArrowLeft size={24}/> Quay lại
              </button>
              <button onClick={() => handleDeleteItem(selectedItem.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg font-bold flex gap-1 items-center transition"><Trash2 size={20}/> Xóa</button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-slate-50 rounded-3xl overflow-hidden border border-slate-200 shadow-inner h-[400px] lg:h-[600px]">
                <img src={selectedItem.image} alt={selectedItem.name} className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-3xl md:text-4xl font-bold text-slate-800 mb-2">{selectedItem.name}</h1>
                <p className="text-sm text-slate-400 font-mono mb-6">ID: {selectedItem.id}</p>
                <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 mb-8"><span className="text-xs font-bold text-blue-400 uppercase tracking-widest block mb-2">Tồn kho hiện tại</span><div className="flex items-center gap-4"><span className="text-5xl font-mono font-bold text-blue-600">{selectedItem.quantity}</span><span className="text-slate-500 font-medium">cái</span></div></div>
                <div className="flex-1"><div className="flex items-center justify-between mb-3"><h2 className="text-xl font-bold flex items-center gap-2 text-slate-700"><AlignLeft size={24}/> Mô tả chi tiết</h2>{!isEditingDesc && (<button onClick={() => setIsEditingDesc(true)} className="text-blue-600 hover:bg-blue-50 px-3 py-1 rounded-lg font-bold text-sm flex gap-1 items-center transition"><Edit3 size={16}/> Sửa nội dung</button>)}</div>{isEditingDesc ? (<div className="animate-in fade-in"><textarea className="w-full h-64 p-4 border-2 border-blue-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg leading-relaxed text-slate-700" value={descValue} onChange={(e) => setDescValue(e.target.value)} placeholder="Nhập thông số kỹ thuật..."></textarea><div className="flex gap-3 mt-3"><button onClick={saveDescription} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 flex gap-2 items-center shadow-lg"><Save size={18}/> Lưu Lại</button><button onClick={() => { setIsEditingDesc(false); setDescValue(selectedItem.description || ""); }} className="bg-slate-200 text-slate-600 px-6 py-2 rounded-lg font-bold hover:bg-slate-300">Hủy</button></div></div>) : (<div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm max-h-[400px] overflow-y-auto">{selectedItem.description ? (<p className="whitespace-pre-wrap text-lg text-slate-600 leading-relaxed">{selectedItem.description}</p>) : (<p className="text-slate-400 italic text-center py-10">Chưa có mô tả nào cho sản phẩm này.</p>)}</div>)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- HEADER --- */}
      <header className="bg-blue-600 text-white shadow-lg sticky top-0 z-20 px-4 pt-4 pb-2">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2"><Package className="w-8 h-8" /><h1 className="text-xl md:text-2xl font-bold">Kho Linh Kiện</h1></div>
          {activeZone !== 'ALL' && activeZone !== 'UNCATEGORIZED' && (
            <button onClick={() => setIsFormOpen(!isFormOpen)} className="bg-white text-blue-600 px-5 py-2.5 rounded-full font-bold flex gap-2 shadow-sm hover:bg-blue-50 transition">
              {isFormOpen ? <Minus size={20} /> : <Plus size={20} />} <span className="hidden sm:inline">{isFormOpen ? 'Đóng' : 'Thêm Mới'}</span>
            </button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          <button onClick={() => { setActiveZone('ALL'); setIsFormOpen(false); }} className={`whitespace-nowrap px-4 py-2 rounded-lg font-bold transition flex items-center gap-2 ${activeZone === 'ALL' ? 'bg-white text-blue-600 shadow-md' : 'bg-blue-700 text-blue-100 hover:bg-blue-500'}`}><LayoutGrid size={18}/> Tất cả</button>
          <button onClick={() => { setActiveZone('UNCATEGORIZED'); setIsFormOpen(false); }} className={`whitespace-nowrap px-4 py-2 rounded-lg font-bold transition flex items-center gap-2 ${activeZone === 'UNCATEGORIZED' ? 'bg-white text-blue-600 shadow-md' : 'bg-blue-700 text-blue-100 hover:bg-blue-500'}`}><AlertCircle size={18}/> Chưa phân vùng</button>
          {zones.map(zone => (
            <div key={zone.id} className="relative group">
              <button onClick={() => { setActiveZone(zone.id); setIsFormOpen(false); }} className={`whitespace-nowrap px-4 py-2 rounded-lg font-bold transition flex items-center gap-2 pr-8 ${activeZone === zone.id ? 'bg-white text-blue-600 shadow-md' : 'bg-blue-700 text-blue-100 hover:bg-blue-500'}`}><MapPin size={18}/> {zone.name}</button>
              <button onClick={(e) => handleDeleteZone(zone.id, e)} className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-blue-300 hover:text-red-300 opacity-50 hover:opacity-100 transition" title="Xóa vùng"><X size={14}/></button>
            </div>
          ))}
          <button onClick={handleAddZone} className="whitespace-nowrap px-4 py-2 rounded-lg font-bold border-2 border-blue-400 border-dashed text-blue-100 hover:bg-blue-500 hover:text-white transition flex items-center gap-2"><Plus size={18}/> Tạo vùng</button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {error && <div className="mb-4 bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded flex items-center gap-2"><AlertCircle size={20} /><p>{error}</p></div>}
        {(loading || isUploading) && (<div className="fixed inset-0 bg-black/30 z-50 flex justify-center items-center backdrop-blur-sm"><div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center"><Loader2 className="animate-spin text-blue-600 w-12 h-12 mb-3" /><p className="font-bold text-lg text-slate-700">{isUploading ? "Đang xử lý ảnh..." : "Đang tải..."}</p></div></div>)}

        {isFormOpen && activeZone !== 'ALL' && activeZone !== 'UNCATEGORIZED' && (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-8 border border-slate-200 animate-in slide-in-from-top-4" onPaste={handlePaste}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-bold text-2xl text-slate-800">Thêm vào: {zones.find(z => z.id === activeZone)?.name}</h2>
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">Hỗ trợ dán ảnh (Ctrl+V)</span>
            </div>
            {isCropping ? (
              <div className="flex flex-col gap-4 animate-in fade-in">
                <div className="relative w-full bg-slate-900 rounded-xl overflow-hidden border-4 border-blue-500 shadow-2xl flex justify-center items-center p-4">
                  <ReactCrop 
                    crop={crop} 
                    onChange={(_, percentCrop) => setCrop(percentCrop)} 
                    onComplete={(c) => setCompletedCrop(c)} 
                    aspect={undefined}
                    minWidth={20}
                    minHeight={20}
                  >
                    <img src={imageSrc} alt="Upload" onLoad={onImageLoad} style={{ maxHeight: '70vh', maxWidth: '100%', objectFit: 'contain' }} />
                  </ReactCrop>
                </div>
                <div className="flex justify-between gap-4 mt-2">
                   <button onClick={() => setIsCropping(false)} className="flex-1 bg-slate-200 text-slate-700 py-3 rounded-xl font-bold flex justify-center items-center gap-2 hover:bg-slate-300 transition text-lg"><X size={20}/> Hủy</button>
                   <button onClick={showCroppedImage} className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold flex justify-center items-center gap-2 hover:bg-green-700 transition shadow-lg text-lg"><Check size={20}/> Cắt & Dùng</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAddItem} className="space-y-6">
                <div><label className="block text-base font-bold mb-2 text-slate-700">Tên linh kiện</label><input type="text" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className="w-full px-5 py-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:ring-0 outline-none text-lg" required placeholder="Nhập tên..." /></div>
                <div className="flex gap-6"><div className="w-1/3"><label className="block text-base font-bold mb-2 text-slate-700">Số lượng</label><input type="number" value={newItemQty} onChange={(e) => setNewItemQty(e.target.value)} className="w-full px-5 py-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none text-lg font-mono" min="0" /></div><div className="w-2/3"><label className="block text-base font-bold mb-2 text-slate-700">Hình ảnh</label>{newItemImage ? (<div className="relative h-64 w-full bg-slate-50 rounded-xl overflow-hidden border-2 border-slate-300 group"><img src={newItemImage} alt="Preview" className="w-full h-full object-cover" /><button type="button" onClick={() => setNewItemImage('')} className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full shadow-lg hover:bg-red-600 transition"><Trash2 size={20}/></button></div>) : (<label className="cursor-pointer bg-slate-50 hover:bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center h-64 text-slate-500 transition hover:border-blue-400 hover:text-blue-500"><ImageIcon size={40} className="mb-2 opacity-50"/><span className="text-sm font-bold">Bấm chọn hoặc dán (Ctrl+V)</span><input type="file" accept="image/*" onChange={onFileChange} className="hidden" /></label>)}</div></div>
                <button type="submit" disabled={isUploading} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 shadow-lg transition flex justify-center items-center gap-2 disabled:bg-slate-400 text-lg"><Save size={24} /> {isUploading ? "Đang lưu..." : "Lưu vào kho"}</button>
              </form>
            )}
          </div>
        )}

        <div className="relative mb-8"><input type="text" placeholder={`Tìm kiếm trong ${activeZone === 'ALL' ? 'tất cả kho' : 'vùng này'}...`} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-6 py-4 rounded-full border border-slate-200 shadow-md focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none text-lg" /><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-6 h-6" /></div>

        {!loading && filteredItems.length === 0 ? (<div className="text-center py-16 text-slate-400 bg-white rounded-3xl border-2 border-dashed border-slate-200"><Package className="w-16 h-16 mx-auto mb-4 opacity-30" /><p className="text-xl font-medium">{activeZone === 'ALL' ? 'Kho chưa có gì cả' : 'Khu vực này đang trống'}</p>{activeZone !== 'ALL' && activeZone !== 'UNCATEGORIZED' && (<p className="text-sm mt-2 text-blue-500 cursor-pointer hover:underline" onClick={() => setIsFormOpen(true)}>Thêm món đầu tiên ngay</p>)}</div>) : (<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">{filteredItems.map((item) => (<div key={item.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col hover:shadow-xl transition-shadow duration-300"><div onClick={() => openDetail(item)} className="h-80 w-full bg-white relative group border-b border-slate-50 p-4 cursor-pointer"><img src={item.image} alt={item.name} className="w-full h-full object-cover rounded-lg transition-transform duration-500 group-hover:scale-105" onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/300x400?text=No+Image'; }} /></div><div className="p-5 flex-1 flex flex-col justify-between"><div className="mb-4"><h3 onClick={() => openDetail(item)} className="font-bold text-slate-800 text-2xl line-clamp-2 leading-tight mb-1 cursor-pointer hover:text-blue-600 transition">{item.name}</h3>{activeZone === 'ALL' && (<span className="text-xs font-bold px-2 py-1 bg-slate-100 text-slate-500 rounded-full">{zones.find(z => z.id === item.zoneId)?.name || 'Chưa phân vùng'}</span>)}</div><div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100 min-h-[60px]">{editingId === item.id ? (<div className="flex items-center justify-between w-full animate-in fade-in duration-200 gap-2"><button onClick={() => setEditQtyValue(prev => (prev === "" || prev <= 0 ? 0 : prev - 1))} className="w-10 h-10 flex-shrink-0 bg-white border border-red-200 rounded-lg flex items-center justify-center hover:bg-red-50 text-red-500 shadow-sm transition"><Minus size={18}/></button><input type="number" value={editQtyValue} onChange={(e) => handleEditQtyChange(e.target.value)} className="w-full h-10 text-center font-mono font-bold text-2xl bg-white border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800" /><button onClick={() => setEditQtyValue(prev => (prev === "" ? 1 : prev + 1))} className="w-10 h-10 flex-shrink-0 bg-white border border-green-200 rounded-lg flex items-center justify-center hover:bg-green-50 text-green-600 shadow-sm transition"><Plus size={18}/></button><button onClick={() => saveQuantity(item.id)} className="w-10 h-10 flex-shrink-0 bg-blue-600 text-white rounded-lg flex items-center justify-center shadow-md hover:bg-blue-700 transition"><Check size={18}/></button><button onClick={() => setEditingId(null)} className="w-10 h-10 flex-shrink-0 bg-slate-200 text-slate-500 rounded-lg flex items-center justify-center hover:bg-slate-300 transition"><X size={18}/></button></div>) : (<div className="flex items-center justify-between w-full"><div className="flex flex-col"><span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Số lượng</span><span className={`font-mono font-bold text-3xl ${item.quantity === 0 ? 'text-red-500' : 'text-blue-600'}`}>{item.quantity}</span></div><button onClick={() => startEditingQty(item)} className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition flex items-center gap-2"><Edit3 size={16}/> Sửa</button></div>)}</div></div></div>))}</div>)}
      </main>

      <footer className="max-w-4xl mx-auto px-4 py-10 text-center text-slate-400 text-sm"><p>© {new Date().getFullYear()} Quản Lý Kho Linh Kiện</p><p className="text-xs mt-1">Lưu trữ: Firebase & Cloudinary</p></footer>
    </div>
  );
}
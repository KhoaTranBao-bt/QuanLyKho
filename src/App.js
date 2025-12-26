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
  orderBy 
} from 'firebase/firestore';
import { 
  Plus, Trash2, Search, Package, Minus, Save, 
  Image as ImageIcon, Loader2, X, Check, AlertCircle, Edit3, ArrowLeft, AlignLeft 
} from 'lucide-react';

// --- THƯ VIỆN CẮT ẢNH ---
import ReactCrop from 'react-image-crop';
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
const COLLECTION_NAME = 'inventory_items';

// --- CẤU HÌNH CLOUDINARY ---
const CLOUD_NAME = "dphexeute"; 
const UPLOAD_PRESET = "kho_linh_kien"; 

export default function App() {
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Form State
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemImage, setNewItemImage] = useState(''); 
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  
  // --- STATE SỬA SỐ LƯỢNG ---
  const [editingId, setEditingId] = useState(null); 
  const [editQtyValue, setEditQtyValue] = useState(0);

  // --- STATE CHI TIẾT SẢN PHẨM ---
  const [selectedItem, setSelectedItem] = useState(null); 
  const [isEditingDesc, setIsEditingDesc] = useState(false); 
  const [descValue, setDescValue] = useState(""); 

  // --- CROPPER STATE ---
  const [imageSrc, setImageSrc] = useState(null);
  const [crop, setCrop] = useState({ unit: '%', width: 100, height: 100, x: 0, y: 0 }); 
  const [completedCrop, setCompletedCrop] = useState(null);
  const [isCropping, setIsCropping] = useState(false);
  const imgRef = useRef(null); 

  // Auth & Data
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
    if (!user) return;
    const q = query(collection(db, COLLECTION_NAME), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      loadedItems.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setItems(loadedItems);
      setLoading(false);
      
      if (selectedItem) {
        const updatedItem = loadedItems.find(i => i.id === selectedItem.id);
        if (updatedItem) setSelectedItem(updatedItem);
      }
    }, (err) => {
      setError("Không thể tải danh sách.");
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user, selectedItem]);

  // --- LOGIC ẢNH & CROP ---
  const onFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) { setError("Ảnh quá lớn (>10MB)."); return; }
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setImageSrc(reader.result);
        setIsCropping(true); 
        setError('');
        setCrop({ unit: '%', width: 100, height: 100, x: 0, y: 0, aspect: undefined }); 
      });
      reader.readAsDataURL(file);
    }
  };

  const onLoad = (img) => {
    imgRef.current = img;
    setCrop({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
  };

  const showCroppedImage = async () => {
    if (!completedCrop || !imgRef.current) {
      setNewItemImage(imageSrc); setIsCropping(false); setImageSrc(null); return;
    }
    try {
      const croppedImageBase64 = await getCroppedImg(imgRef.current, completedCrop, 'newFile.jpeg');
      setNewItemImage(croppedImageBase64); setIsCropping(false); setImageSrc(null);
    } catch (e) { setError("Lỗi cắt ảnh."); }
  };

  const uploadToCloudinary = async (base64Image) => {
    const formData = new FormData();
    formData.append("file", base64Image);
    formData.append("upload_preset", UPLOAD_PRESET);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: formData });
    if (!response.ok) throw new Error("Lỗi upload");
    const data = await response.json();
    return data.secure_url;
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
      if (newItemImage && newItemImage.startsWith('data:image')) {
         finalImageUrl = await uploadToCloudinary(newItemImage);
      } else if (newItemImage) { finalImageUrl = newItemImage; }

      await addDoc(collection(db, COLLECTION_NAME), {
        name: newItemName,
        quantity: parseInt(newItemQty),
        image: finalImageUrl,
        description: "",
        createdAt: serverTimestamp(),
        createdBy: user.uid
      });
      setNewItemName(''); setNewItemQty(1); setNewItemImage(''); setIsFormOpen(false); setError('');
    } catch (err) { setError("Lỗi khi lưu."); } finally { setIsUploading(false); }
  };

  const handleDeleteItem = async (id) => {
    if (window.confirm("Xóa linh kiện này?")) {
      try { await deleteDoc(doc(db, COLLECTION_NAME, id)); setSelectedItem(null); }
      catch (err) { setError("Lỗi xóa."); }
    }
  };

  // --- LOGIC SỬA SỐ LƯỢNG ---
  const startEditingQty = (item) => { setEditingId(item.id); setEditQtyValue(item.quantity); };
  const handleEditQtyChange = (val) => { const v = parseInt(val); if (!isNaN(v) && v >= 0) setEditQtyValue(v); else if (val === "") setEditQtyValue(""); };
  const saveQuantity = async (id) => {
    if (editQtyValue === "" || editQtyValue < 0) { alert("Số lượng sai!"); return; }
    try { await updateDoc(doc(db, COLLECTION_NAME, id), { quantity: parseInt(editQtyValue) }); setEditingId(null); } catch (err) {}
  };

  // --- LOGIC TRANG CHI TIẾT & MÔ TẢ ---
  const openDetail = (item) => {
    setSelectedItem(item);
    setDescValue(item.description || ""); 
    setIsEditingDesc(false);
  };

  const saveDescription = async () => {
    if (!selectedItem) return;
    try {
      await updateDoc(doc(db, COLLECTION_NAME, selectedItem.id), { description: descValue });
      setIsEditingDesc(false);
    } catch (err) { setError("Lỗi lưu mô tả."); }
  };

  const filteredItems = items.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()));

  // --- RENDER GIAO DIỆN ---
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-10">
      
      {/* 1. TRANG CHI TIẾT SẢN PHẨM (Overlay) */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto animate-in slide-in-from-right duration-300">
          <div className="max-w-5xl mx-auto px-4 py-6">
            {/* Header Chi tiết */}
            <div className="flex items-center justify-between mb-6 sticky top-0 bg-white/95 backdrop-blur py-4 border-b border-slate-100 z-10">
              <button onClick={() => setSelectedItem(null)} className="flex items-center gap-2 text-slate-500 hover:text-blue-600 font-bold transition">
                <ArrowLeft size={24}/> Quay lại
              </button>
              <div className="flex gap-2">
                 <button onClick={() => handleDeleteItem(selectedItem.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg font-bold flex gap-1 items-center transition">
                    <Trash2 size={20}/> <span className="hidden sm:inline">Xóa Sản Phẩm</span>
                 </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* --- CỘT TRÁI: ẢNH (CHỈNH SỬA: OBJECT-COVER TRÀN VIỀN) --- */}
              <div className="bg-slate-100 rounded-2xl overflow-hidden border border-slate-200 shadow-inner flex items-center justify-center h-[400px] lg:h-[600px]">
                {/* - object-cover: Phủ kín khung
                   - w-full h-full: Kéo dãn hết cỡ
                   - Không còn padding (p-4)
                */}
                <img 
                  src={selectedItem.image} 
                  alt={selectedItem.name} 
                  className="w-full h-full object-cover" 
                />
              </div>

              {/* Cột Phải: Thông tin */}
              <div className="flex flex-col">
                <h1 className="text-3xl md:text-4xl font-bold text-slate-800 mb-2">{selectedItem.name}</h1>
                <p className="text-sm text-slate-400 font-mono mb-6">ID: {selectedItem.id}</p>

                {/* Số Lượng */}
                <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 mb-8">
                   <span className="text-xs font-bold text-blue-400 uppercase tracking-widest block mb-2">Tồn kho hiện tại</span>
                   <div className="flex items-center gap-4">
                      <span className="text-5xl font-mono font-bold text-blue-600">{selectedItem.quantity}</span>
                      <span className="text-slate-500 font-medium">cái</span>
                   </div>
                </div>

                {/* Mô Tả */}
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-slate-700">
                      <AlignLeft size={24}/> Mô tả chi tiết
                    </h2>
                    {!isEditingDesc && (
                      <button onClick={() => setIsEditingDesc(true)} className="text-blue-600 hover:bg-blue-50 px-3 py-1 rounded-lg font-bold text-sm flex gap-1 items-center transition">
                        <Edit3 size={16}/> Sửa nội dung
                      </button>
                    )}
                  </div>

                  {isEditingDesc ? (
                    <div className="animate-in fade-in">
                      <textarea 
                        className="w-full h-64 p-4 border-2 border-blue-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg leading-relaxed text-slate-700"
                        value={descValue}
                        onChange={(e) => setDescValue(e.target.value)}
                        placeholder="Nhập thông số kỹ thuật, ghi chú, vị trí cất giữ..."
                      ></textarea>
                      <div className="flex gap-3 mt-3">
                        <button onClick={saveDescription} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 flex gap-2 items-center shadow-lg"><Save size={18}/> Lưu Lại</button>
                        <button onClick={() => { setIsEditingDesc(false); setDescValue(selectedItem.description || ""); }} className="bg-slate-200 text-slate-600 px-6 py-2 rounded-lg font-bold hover:bg-slate-300">Hủy</button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm max-h-[400px] overflow-y-auto">
                      {selectedItem.description ? (
                        <p className="whitespace-pre-wrap text-lg text-slate-600 leading-relaxed">
                          {selectedItem.description}
                        </p>
                      ) : (
                        <p className="text-slate-400 italic text-center py-10">Chưa có mô tả nào cho sản phẩm này.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. TRANG CHỦ */}
      <header className="bg-blue-600 text-white shadow-lg sticky top-0 z-10 px-4 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2"><Package className="w-8 h-8" /><h1 className="text-xl md:text-2xl font-bold">Kho Linh Kiện</h1></div>
        <button onClick={() => setIsFormOpen(!isFormOpen)} className="bg-white text-blue-600 px-5 py-2.5 rounded-full font-bold flex gap-2 shadow-sm hover:bg-blue-50 transition">
          {isFormOpen ? <Minus size={20} /> : <Plus size={20} />} <span className="hidden sm:inline">{isFormOpen ? 'Đóng' : 'Thêm Mới'}</span>
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {error && <div className="mb-4 bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded flex items-center gap-2"><AlertCircle size={20} /><p>{error}</p></div>}
        
        {(loading || isUploading) && (
          <div className="fixed inset-0 bg-black/30 z-50 flex justify-center items-center backdrop-blur-sm">
            <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center">
              <Loader2 className="animate-spin text-blue-600 w-12 h-12 mb-3" />
              <p className="font-bold text-lg text-slate-700">{isUploading ? "Đang xử lý ảnh..." : "Đang tải..."}</p>
            </div>
          </div>
        )}

        {isFormOpen && (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-8 border border-slate-200 animate-in slide-in-from-top-4">
            <h2 className="font-bold mb-6 text-2xl text-slate-800">Thêm linh kiện mới</h2>
            {isCropping ? (
              <div className="flex flex-col gap-4 animate-in fade-in">
                <div className="relative h-96 w-full bg-slate-900 rounded-xl overflow-hidden border-4 border-blue-500 shadow-2xl flex justify-center items-center p-4">
                  <ReactCrop crop={crop} onChange={(c) => setCrop(c)} onComplete={(c) => setCompletedCrop(c)} aspect={undefined}>
                    <img src={imageSrc} alt="Upload" onLoad={(e) => onLoad(e.target)} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                  </ReactCrop>
                </div>
                <div className="flex justify-between gap-4 mt-2">
                   <button onClick={() => setIsCropping(false)} className="flex-1 bg-slate-200 text-slate-700 py-3 rounded-xl font-bold flex justify-center items-center gap-2 hover:bg-slate-300 transition text-lg"><X size={20}/> Hủy</button>
                   <button onClick={showCroppedImage} className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold flex justify-center items-center gap-2 hover:bg-green-700 transition shadow-lg text-lg"><Check size={20}/> Cắt Ảnh Này</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAddItem} className="space-y-6">
                <div>
                  <label className="block text-base font-bold mb-2 text-slate-700">Tên linh kiện</label>
                  <input type="text" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className="w-full px-5 py-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:ring-0 outline-none text-lg" required placeholder="Nhập tên..." />
                </div>
                <div className="flex gap-6">
                  <div className="w-1/3">
                    <label className="block text-base font-bold mb-2 text-slate-700">Số lượng</label>
                    <input type="number" value={newItemQty} onChange={(e) => setNewItemQty(e.target.value)} className="w-full px-5 py-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none text-lg font-mono" min="0" />
                  </div>
                  <div className="w-2/3">
                    <label className="block text-base font-bold mb-2 text-slate-700">Hình ảnh</label>
                    {newItemImage ? (
                      <div className="relative h-64 w-full bg-slate-50 rounded-xl overflow-hidden border-2 border-slate-300 group">
                        <img src={newItemImage} alt="Preview" className="w-full h-full object-cover" />
                        <button type="button" onClick={() => setNewItemImage('')} className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full shadow-lg hover:bg-red-600 transition"><Trash2 size={20}/></button>
                      </div>
                    ) : (
                      <label className="cursor-pointer bg-slate-50 hover:bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center h-64 text-slate-500 transition hover:border-blue-400 hover:text-blue-500">
                        <ImageIcon size={40} className="mb-2 opacity-50"/>
                        <span className="text-sm font-bold">Bấm để chọn ảnh</span>
                        <input type="file" accept="image/*" onChange={onFileChange} className="hidden" />
                      </label>
                    )}
                  </div>
                </div>
                <button type="submit" disabled={isUploading} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 shadow-lg transition flex justify-center items-center gap-2 disabled:bg-slate-400 text-lg">
                  <Save size={24} /> {isUploading ? "Đang lưu..." : "Lưu Linh Kiện"}
                </button>
              </form>
            )}
          </div>
        )}

        <div className="relative mb-8">
          <input type="text" placeholder="Tìm kiếm nhanh..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-6 py-4 rounded-full border border-slate-200 shadow-md focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none text-lg" />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-6 h-6" />
        </div>

        {!loading && filteredItems.length === 0 ? (
          <div className="text-center py-16 text-slate-400 bg-white rounded-3xl border-2 border-dashed border-slate-200">
            <Package className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-xl font-medium">Kho chưa có gì cả</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems.map((item) => (
              <div key={item.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col hover:shadow-xl transition-shadow duration-300">
                <div onClick={() => openDetail(item)} className="h-80 w-full bg-white relative group border-b border-slate-50 p-4 cursor-pointer">
                  <img src={item.image} alt={item.name} className="w-full h-full object-cover rounded-lg transition-transform duration-500 group-hover:scale-105" onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/300x400?text=No+Image'; }} />
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div className="mb-4">
                    <h3 onClick={() => openDetail(item)} className="font-bold text-slate-800 text-2xl line-clamp-2 leading-tight mb-1 cursor-pointer hover:text-blue-600 transition">{item.name}</h3>
                  </div>
                  
                  <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100 min-h-[60px]">
                    {editingId === item.id ? (
                      <div className="flex items-center justify-between w-full animate-in fade-in duration-200 gap-2">
                        <button onClick={() => setEditQtyValue(prev => (prev === "" || prev <= 0 ? 0 : prev - 1))} className="w-10 h-10 flex-shrink-0 bg-white border border-red-200 rounded-lg flex items-center justify-center hover:bg-red-50 text-red-500 shadow-sm transition"><Minus size={18}/></button>
                        <input type="number" value={editQtyValue} onChange={(e) => handleEditQtyChange(e.target.value)} className="w-full h-10 text-center font-mono font-bold text-2xl bg-white border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800" />
                        <button onClick={() => setEditQtyValue(prev => (prev === "" ? 1 : prev + 1))} className="w-10 h-10 flex-shrink-0 bg-white border border-green-200 rounded-lg flex items-center justify-center hover:bg-green-50 text-green-600 shadow-sm transition"><Plus size={18}/></button>
                        <button onClick={() => saveQuantity(item.id)} className="w-10 h-10 flex-shrink-0 bg-blue-600 text-white rounded-lg flex items-center justify-center shadow-md hover:bg-blue-700 transition"><Check size={18}/></button>
                        <button onClick={() => setEditingId(null)} className="w-10 h-10 flex-shrink-0 bg-slate-200 text-slate-500 rounded-lg flex items-center justify-center hover:bg-slate-300 transition"><X size={18}/></button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between w-full">
                         <div className="flex flex-col">
                            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Số lượng</span>
                            <span className={`font-mono font-bold text-3xl ${item.quantity === 0 ? 'text-red-500' : 'text-blue-600'}`}>{item.quantity}</span>
                         </div>
                         <button onClick={() => startEditingQty(item)} className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition flex items-center gap-2">
                            <Edit3 size={16}/> Sửa
                         </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="max-w-4xl mx-auto px-4 py-10 text-center text-slate-400 text-sm">
        <p>© {new Date().getFullYear()} Quản Lý Kho Linh Kiện</p>
        <p className="text-xs mt-1">Lưu trữ: Firebase & Cloudinary</p>
      </footer>
    </div>
  );
}
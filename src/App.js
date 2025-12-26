import React, { useState, useEffect, useCallback } from 'react';
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
  Image as ImageIcon, Loader2, X, Check, AlertCircle 
} from 'lucide-react';
import Cropper from 'react-easy-crop';
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
// Tôi đã điền sẵn Cloud Name của bạn lấy từ ảnh
const CLOUD_NAME = "dphexeute"; 
const UPLOAD_PRESET = "kho_linh_kien"; // Hãy chắc chắn bạn đã tạo preset tên y hệt thế này

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
  const [isUploading, setIsUploading] = useState(false); // State mới để hiện loading khi đang up ảnh

  // --- CROPPER STATE ---
  const [imageSrc, setImageSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [isCropping, setIsCropping] = useState(false);

  // 1. Auth
  useEffect(() => {
    const initAuth = async () => {
      try { 
        await signInAnonymously(auth); 
      } catch (err) { 
        console.error("Lỗi xác thực:", err);
        setError("Không thể kết nối đến hệ thống xác thực.");
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. Data Fetching
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, COLLECTION_NAME), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      loadedItems.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setItems(loadedItems);
      setLoading(false);
    }, (err) => {
      console.error("Lỗi tải dữ liệu:", err);
      setError("Không thể tải danh sách linh kiện.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // --- LOGIC CẮT ẢNH ---
  const onFileChange = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setImageSrc(reader.result);
        setIsCropping(true); 
        setError('');
      });
      reader.readAsDataURL(file);
    }
  };

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const showCroppedImage = useCallback(async () => {
    try {
      const croppedImageBase64 = await getCroppedImg(imageSrc, croppedAreaPixels);
      setNewItemImage(croppedImageBase64);
      setIsCropping(false);
      setImageSrc(null);
      setZoom(1);
    } catch (e) {
      console.error(e);
      setError("Có lỗi khi cắt ảnh.");
    }
  }, [imageSrc, croppedAreaPixels]);

  // --- HÀM UPLOAD LÊN CLOUDINARY ---
  const uploadToCloudinary = async (base64Image) => {
    const formData = new FormData();
    formData.append("file", base64Image);
    formData.append("upload_preset", UPLOAD_PRESET);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
      { method: "POST", body: formData }
    );
    
    if (!response.ok) throw new Error("Lỗi khi upload lên Cloudinary");
    const data = await response.json();
    return data.secure_url;
  };

  // --- CRUD FUNCTIONS ---
  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!newItemName.trim() || !user) return;
    
    setIsUploading(true); // Bật loading upload

    try {
      let finalImageUrl = 'https://via.placeholder.com/150?text=No+Image';

      // Nếu có ảnh Base64 (từ việc cắt ảnh), thì upload lên Cloudinary
      if (newItemImage && newItemImage.startsWith('data:image')) {
         finalImageUrl = await uploadToCloudinary(newItemImage);
      } else if (newItemImage) {
         // Nếu người dùng paste link ảnh online
         finalImageUrl = newItemImage;
      }

      await addDoc(collection(db, COLLECTION_NAME), {
        name: newItemName,
        quantity: parseInt(newItemQty),
        image: finalImageUrl, // Lưu link ngắn gọn từ Cloudinary
        createdAt: serverTimestamp(),
        createdBy: user.uid
      });

      // Reset form
      setNewItemName(''); setNewItemQty(1); setNewItemImage(''); setIsFormOpen(false);
      setError('');
    } catch (err) { 
      console.error("Lỗi:", err);
      setError("Có lỗi khi upload ảnh hoặc lưu dữ liệu. Hãy kiểm tra lại Preset Cloudinary.");
    } finally {
      setIsUploading(false); // Tắt loading upload
    }
  };

  const handleDeleteItem = async (id) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa linh kiện này không?")) {
      try { await deleteDoc(doc(db, COLLECTION_NAME, id)); } 
      catch (err) { setError("Không xóa được linh kiện."); }
    }
  };

  const handleUpdateQuantity = async (id, qty, change) => {
    if (qty + change >= 0) {
      try { await updateDoc(doc(db, COLLECTION_NAME, id), { quantity: qty + change }); } 
      catch (err) { console.error(err); }
    }
  };

  const filteredItems = items.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-10">
      <header className="bg-blue-600 text-white shadow-lg sticky top-0 z-10 px-4 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2"><Package className="w-8 h-8" /><h1 className="text-xl font-bold">Kho Linh Kiện</h1></div>
        <button onClick={() => setIsFormOpen(!isFormOpen)} className="bg-white text-blue-600 px-4 py-2 rounded-full font-bold flex gap-2">
          {isFormOpen ? <Minus size={18} /> : <Plus size={18} />} <span className="hidden sm:inline">{isFormOpen ? 'Đóng Form' : 'Thêm Mới'}</span>
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded shadow-sm flex items-center gap-2">
            <AlertCircle size={20} />
            <p>{error}</p>
          </div>
        )}

        {(loading || isUploading) && (
          <div className="fixed inset-0 bg-black/20 z-50 flex justify-center items-center backdrop-blur-sm">
            <div className="bg-white p-6 rounded-xl shadow-xl flex flex-col items-center">
              <Loader2 className="animate-spin text-blue-600 w-10 h-10 mb-2" />
              <p className="font-bold text-slate-700">{isUploading ? "Đang xử lý & Upload ảnh..." : "Đang tải dữ liệu..."}</p>
            </div>
          </div>
        )}

        {isFormOpen && (
          <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-slate-200">
            <h2 className="font-bold mb-4 text-lg text-slate-700">Thêm linh kiện mới</h2>
            
            {isCropping ? (
              <div className="flex flex-col gap-4 animate-in fade-in duration-300">
                <div className="relative h-72 w-full bg-slate-900 rounded-lg overflow-hidden border-2 border-blue-500 shadow-inner">
                  <Cropper
                    image={imageSrc}
                    crop={crop}
                    zoom={zoom}
                    aspect={4 / 3}
                    onCropChange={setCrop}
                    onCropComplete={onCropComplete}
                    onZoomChange={setZoom}
                  />
                </div>
                <div className="flex flex-col gap-2">
                   <div className="flex items-center gap-2 px-2">
                      <span className="text-xs font-bold text-slate-500">Zoom:</span>
                      <input type="range" value={zoom} min={1} max={3} step={0.1} onChange={(e) => setZoom(e.target.value)} className="w-full accent-blue-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                   </div>
                   <div className="flex justify-between gap-4 mt-2">
                      <button onClick={() => setIsCropping(false)} className="flex-1 bg-slate-200 text-slate-700 py-2 rounded-lg font-bold flex justify-center items-center gap-2 hover:bg-slate-300 transition"><X size={18}/> Hủy</button>
                      <button onClick={showCroppedImage} className="flex-1 bg-green-600 text-white py-2 rounded-lg font-bold flex justify-center items-center gap-2 hover:bg-green-700 transition shadow-lg shadow-green-200"><Check size={18}/> Cắt & Dùng Ảnh</button>
                   </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAddItem} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-600">Tên linh kiện</label>
                  <input type="text" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required placeholder="VD: Mạch Uno R3..." />
                </div>
                <div className="flex gap-4">
                  <div className="w-1/3">
                    <label className="block text-sm font-medium mb-1 text-slate-600">Số lượng</label>
                    <input type="number" value={newItemQty} onChange={(e) => setNewItemQty(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" min="0" />
                  </div>
                  <div className="w-2/3">
                    <label className="block text-sm font-medium mb-1 text-slate-600">Hình ảnh</label>
                    {newItemImage ? (
                      <div className="relative h-32 w-full bg-slate-50 rounded-lg overflow-hidden border border-slate-300 group">
                        <img src={newItemImage} alt="Preview" className="w-full h-full object-contain" />
                        <button type="button" onClick={() => setNewItemImage('')} className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full shadow-md hover:bg-red-600 transition"><Trash2 size={16}/></button>
                      </div>
                    ) : (
                      <label className="cursor-pointer bg-slate-50 hover:bg-slate-100 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center h-32 text-slate-500 transition hover:border-blue-400 hover:text-blue-500">
                        <ImageIcon size={28} className="mb-2"/>
                        <span className="text-xs font-bold">Bấm để chọn ảnh</span>
                        <input type="file" accept="image/*" onChange={onFileChange} className="hidden" />
                      </label>
                    )}
                  </div>
                </div>
                <button type="submit" disabled={isUploading} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 shadow-md transition flex justify-center items-center gap-2 disabled:bg-blue-300">
                  <Save size={20} /> {isUploading ? "Đang xử lý..." : "Lưu Vào Kho"}
                </button>
              </form>
            )}
          </div>
        )}

        {/* --- DANH SÁCH --- */}
        <div className="relative mb-6">
          <input type="text" placeholder="Tìm kiếm linh kiện..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-3 rounded-full border border-slate-200 shadow-sm focus:ring-2 focus:ring-blue-400 outline-none" />
          <Search className="absolute left-3 top-3.5 text-slate-400 w-5 h-5" />
        </div>

        {!loading && filteredItems.length === 0 ? (
          <div className="text-center py-12 text-slate-500 bg-white rounded-xl border border-dashed border-slate-300">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg">Kho đang trống hoặc không tìm thấy kết quả.</p>
            <button onClick={() => setIsFormOpen(true)} className="text-blue-600 font-semibold hover:underline mt-2">Thêm linh kiện mới ngay</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map((item) => (
              <div key={item.id} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden flex flex-col hover:shadow-md transition">
                <div className="h-48 w-full bg-white relative group border-b border-slate-50">
                  <img src={item.image} alt={item.name} className="w-full h-full object-contain p-2" 
                    onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/300x200?text=No+Image'; }} />
                  <button onClick={() => handleDeleteItem(item.id)} className="absolute top-2 right-2 bg-white p-2 rounded-full text-red-500 shadow opacity-0 group-hover:opacity-100 transition hover:bg-red-50" title="Xóa"><Trash2 size={18} /></button>
                </div>
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg line-clamp-2 mb-1">{item.name}</h3>
                    <p className="text-xs text-slate-400 mb-2">ID: {item.id.slice(0,8)}...</p>
                  </div>
                  <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <button onClick={() => handleUpdateQuantity(item.id, item.quantity, -1)} className="w-8 h-8 bg-white border rounded-full flex items-center justify-center hover:bg-slate-200 text-slate-600 disabled:opacity-50" disabled={item.quantity <= 0}><Minus size={16}/></button>
                    <span className={`font-mono font-bold text-lg ${item.quantity === 0 ? 'text-red-500' : 'text-blue-600'}`}>{item.quantity}</span>
                    <button onClick={() => handleUpdateQuantity(item.id, item.quantity, 1)} className="w-8 h-8 bg-white border rounded-full flex items-center justify-center hover:bg-slate-200 text-slate-600"><Plus size={16}/></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <footer className="max-w-4xl mx-auto px-4 py-8 text-center text-slate-400 text-sm">
        <p>© {new Date().getFullYear()} Quản Lý Kho Linh Kiện Cá Nhân</p>
        <p className="text-xs mt-1">Dữ liệu được lưu trữ trên Google Firebase & Cloudinary</p>
      </footer>
    </div>
  );
}